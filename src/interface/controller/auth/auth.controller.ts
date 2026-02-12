import { Controller, Post, Body, BadRequestException, UnauthorizedException, UseGuards, Req, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SSOService } from '../../../integrations/sso/sso.service';
import { OrganizationMigrationService } from '../../../integrations/migration/migration.service';
import { EmployeeDepartmentPosition } from '../../../integrations/migration/organization/entities/employee-department-position.entity';
import { TokenBlacklistService } from '../../../business/external-share/security/token-blacklist.service';
import { RefreshTokenService } from '../../../business/auth/refresh-token.service';
import { GenerateTokenRequestDto, GenerateTokenResponseDto } from './dto/generate-token.dto';
import { VerifyTokenRequestDto, VerifyTokenResponseDto } from './dto/verify-token.dto';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { MigrateOrganizationRequestDto, MigrateOrganizationResponseDto } from './dto/migrate-organization.dto';
import { AuditAction, AuthEventActor } from '../../../common/decorators/audit-action.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { AuditAction as AuditActionEnum } from '../../../domain/audit/enums/audit-action.enum';
import { TargetType, UserType } from '../../../domain/audit/enums/common.enum';
import { UnifiedJwtAuthGuard } from '../../../common/guards';

/**
 * 인증 컨트롤러
 *
 * JWT 토큰 생성 및 검증 API를 제공합니다.
 */
@ApiTags('100.인증')
@Controller('v1/auth')
export class AuthController {
    private readonly logger = new Logger(AuthController.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly ssoService: SSOService,
        private readonly organizationMigrationService: OrganizationMigrationService,
        private readonly tokenBlacklistService: TokenBlacklistService,
        private readonly refreshTokenService: RefreshTokenService,
        @InjectRepository(EmployeeDepartmentPosition)
        private readonly edpRepository: Repository<EmployeeDepartmentPosition>,
    ) { }

    /**
     * 직원이 외부 부서(EXTERNAL_DEPARTMENT_ID) 소속인지 확인
     */
    private async isExternalDepartment(employeeId: string): Promise<boolean> {
        const externalDepartmentId = this.configService.get<string>('EXTERNAL_DEPARTMENT_ID');
        if (!externalDepartmentId) {
            return false;
        }
        const position = await this.edpRepository.findOne({
            where: { employeeId, departmentId: externalDepartmentId },
        });
        return !!position;
    }

    /**
     * 부서 기반으로 userType 결정
     */
    private async resolveUserType(employeeId: string): Promise<'internal' | 'external'> {
        const isExternal = await this.isExternalDepartment(employeeId);
        return isExternal ? 'external' : 'internal';
    }

    /**
     * SSO 로그인
     *
     * SSO를 통해 로그인하고 DMS-API JWT 토큰을 발급합니다.
     */
    @Post('login')
    @AuditAction({
        action: AuditActionEnum.LOGIN_SUCCESS,
        targetType: TargetType.USER,
        authEvent: true,
        extractActorFromResponse: (res): AuthEventActor => ({
            userId: res.user.id,
            userName: res.user.name,
            userEmail: res.user.email,
            userType: res.userType === 'external' ? UserType.EXTERNAL : UserType.INTERNAL,
        }),
        extractTargetIdFromResponse: (res) => res.user.id,
    })
    @ApiOperation({
        summary: 'SSO 로그인-DMS-API JWT 토큰 발급',
        description: 'SSO를 통해 로그인하고 DMS-API JWT 토큰을 발급합니다.',
    })
    async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
        try {
            // SSO 로그인
            const ssoResponse = await this.ssoService.login(dto.email, dto.password);

            // SSO 응답에서 직원 번호 추출
            if (!ssoResponse.employeeNumber) {
                throw new UnauthorizedException('SSO 로그인 응답에 직원 번호가 없습니다.');
            }

            // SSO를 통해 직원 상세 정보 조회
            const employee = await this.ssoService.getEmployee({
                employeeNumber: ssoResponse.employeeNumber,
                withDetail: true,
            });

            // 부서 기반 userType 결정
            const userType = await this.resolveUserType(employee.id);

            // 액세스 토큰 생성 (JWT, 30분)
            const { accessToken, expiresIn } = this.refreshTokenService.createAccessToken(
                employee.id,
                userType,
            );

            // 리프레시 토큰 생성 (opaque, DB 저장)
            const { refreshToken } = await this.refreshTokenService.createRefreshToken(
                employee.id,
                userType,
            );

            return {
                success: true,
                accessToken,
                refreshToken,
                token: accessToken, // 하위 호환 (deprecated)
                user: {
                    id: employee.id,
                    employeeNumber: employee.employeeNumber,
                    name: employee.name,
                    email: employee.email,
                },
                userType,
                expiresIn,
            };
        } catch (error: any) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException(`로그인 실패: ${error.message || '알 수 없는 오류'}`);
        }
    }

    /**
     * 로그아웃
     *
     * 현재 세션을 종료하고 로그아웃 이벤트를 기록합니다.
     */
    @Post('logout')
    @UseGuards(UnifiedJwtAuthGuard)
    @ApiBearerAuth()
    @AuditAction({
        action: AuditActionEnum.LOGOUT,
        targetType: TargetType.USER,
        authEvent: true,
    })
    @ApiOperation({
        summary: '로그아웃',
        description: '현재 세션을 종료하고 로그아웃 이벤트를 기록합니다.',
    })
    async logout(
        @User() user: { id: string; name?: string; type?: string },
        @Req() req: any,
    ): Promise<LogoutResponseDto> {
        this.logger.log(`로그아웃: userId=${user.id}, type=${user.type}`);

        // 1. 액세스 토큰 블랙리스트에 추가 (로그아웃 후 재사용 방지)
        const accessToken = req['accessToken'] as string;
        if (accessToken) {
            const payload = this.jwtService.decode(accessToken) as { exp?: number } | null;
            let expiresAt: Date;
            if (payload?.exp) {
                expiresAt = new Date(payload.exp * 1000);
            } else {
                const expiresInSec = parseInt(
                    this.configService.get<string>('ACCESS_TOKEN_EXPIRES_IN') || '1800',
                    10,
                );
                expiresAt = new Date(Date.now() + expiresInSec * 1000);
            }
            await this.tokenBlacklistService.addToBlacklist(
                accessToken,
                user.id,
                user.type ?? 'internal',
                'logout',
                expiresAt,
            );
        }

        // 2. 해당 사용자의 모든 활성 리프레시 토큰 무효화
        await this.refreshTokenService.revokeAllForUser(user.id);

        return {
            success: true,
            message: '로그아웃되었습니다.',
        };
    }

    /**
     * DMS 토큰 갱신
     *
     * DMS 리프레시 토큰을 사용하여 새로운 액세스 토큰과 리프레시 토큰을 발급받습니다.
     * 토큰 로테이션: 기존 리프레시 토큰은 사용됨(used) 처리되고 새 리프레시 토큰이 발급됩니다.
     */
    @Post('refresh-token')
    @UseGuards(UnifiedJwtAuthGuard)
    @ApiBearerAuth()
    @AuditAction({
        action: AuditActionEnum.TOKEN_REFRESH,
        targetType: TargetType.USER,
        authEvent: true,
        // Guard가 있어 snapshot에 userId가 세팅됨 → extractActorFromResponse 불필요
    })
    @ApiOperation({
        summary: 'DMS 토큰 갱신',
        description: 'DMS 리프레시 토큰을 사용하여 새로운 액세스 토큰과 리프레시 토큰을 발급받습니다. 토큰 로테이션이 적용됩니다.',
    })
    async refreshToken(@Body() dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
        const { accessToken, refreshToken, expiresIn } =
            await this.refreshTokenService.rotateRefreshToken(dto.refreshToken);

        return {
            success: true,
            accessToken,
            refreshToken,
            expiresIn,
        };
    }

    /**
     * DMS-API JWT 토큰 생성
     *
     * 만료시간 2개월로 유효한 DMS-API JWT 토큰을 생성합니다.
     */
    @Post('generate-token')
    @AuditAction({
        action: AuditActionEnum.TOKEN_GENERATE,
        targetType: TargetType.SYSTEM,
    })
    @ApiOperation({
        summary: 'DMS-API JWT 토큰 생성- 테스트용',
        description: '만료시간 2개월로 유효한 JWT 토큰을 생성합니다.',
    })
    async generateToken(@Body() dto: GenerateTokenRequestDto): Promise<GenerateTokenResponseDto> {
        try {
            // 사번으로 직원 조회하여 userId 획득
            const employee = await this.ssoService.getEmployee({
                employeeNumber: dto.employeeNumber,
                withDetail: false,
            });

            // 보안: userId만 포함하는 최소 JWT payload 생성
            const jwtPayload = {
                sub: employee.id,
                type: 'internal',
            };

            // 만료시간 2개월로 토큰 생성
            const expiresIn = 60 * 60 * 24 * 60; // 2개월 (초)
            const token = this.jwtService.sign(jwtPayload, {
                secret: this.configService.get<string>('INNER_SECRET'),
                expiresIn,
            });

            const expiresAt = new Date(Date.now() + expiresIn * 1000);
            return {
                success: true,
                token,
                tokenInfo: {
                    employeeNumber: dto.employeeNumber,
                    name: dto.name,
                    email: dto.email,
                    issuedAt: new Date(),
                    expiresAt,
                },
                usage: `Authorization: Bearer ${token}`,
            };
        } catch (error: any) {
            throw new BadRequestException(`토큰 생성 실패: ${error.message}`);
        }
    }

    /**
     * 
     * DMS-API JWT 토큰 검증
     *
     * DMS-API JWT 토큰의 유효성을 검증하고 payload를 반환합니다.
     */
    @Post('verify-token')
    @ApiOperation({
        summary: 'DMS-API JWT 토큰 검증- 테스트용',
        description: 'DMS-API JWT 토큰의 유효성을 검증하고 payload를 반환합니다.',
    })
    async verifyToken(@Body() dto: VerifyTokenRequestDto): Promise<VerifyTokenResponseDto> {
        try {
            const secret =
                this.configService.get<string>('INNER_SECRET');

            if (!secret) {
                throw new BadRequestException('JWT 시크릿이 설정되지 않았습니다.');
            }

            // 토큰 검증
            const payload = this.jwtService.verify(dto.token, {
                secret,
            });

            // iat(issued at)는 토큰이 발급된 시간(유닉스 타임스탬프), exp(expiration)은 토큰의 만료 시간(유닉스 타임스탬프)입니다.
            // 둘 다 JWT 표준 클레임으로, 토큰의 유효 기간을 판단할 때 사용됩니다.

            return {
                valid: true,
                payload: {
                    sub: payload.sub,     // 사용자 ID
                    type: payload.type,   // 사용자 타입 (internal/external)
                    iat: payload.iat,     // 토큰 발급 시간(issued at)
                    exp: payload.exp,     // 토큰 만료 시간(expiration)
                    ...payload,
                },
            };
        } catch (error: any) {
            // 토큰 만료 오류
            if (error.name === 'TokenExpiredError') {
                return {
                    valid: false,
                    expired: true,
                    error: '토큰이 만료되었습니다.',
                };
            }

            // 토큰 형식 오류
            if (error.name === 'JsonWebTokenError') {
                return {
                    valid: false,
                    error: '유효하지 않은 토큰입니다.',
                };
            }

            // 기타 오류
            return {
                valid: false,
                error: error.message || '토큰 검증 중 오류가 발생했습니다.',
            };
        }
    }

    /**
     * 조직 데이터 마이그레이션
     *
     * SSO에서 모든 조직 데이터를 가져와 로컬 DB에 저장합니다.
     */
    @Post('migrate-organization')
    @AuditAction({
        action: AuditActionEnum.ORG_MIGRATION,
        targetType: TargetType.SYSTEM,
    })
    @ApiOperation({
        summary: '조직 데이터 마이그레이션-테스트용',
        description: 'SSO에서 모든 조직 데이터를 가져와 로컬 DB에 저장합니다. (부서, 직원, 직급, 직책 등)',
    })
    async migrateOrganization(@Body() dto: MigrateOrganizationRequestDto): Promise<MigrateOrganizationResponseDto> {
        try {
            const result = await this.organizationMigrationService.마이그레이션한다({
                includeTerminated: dto.includeTerminated,
                includeInactiveDepartments: dto.includeInactiveDepartments,
            });

            return {
                success: result.success,
                statistics: result.statistics,
            };
        } catch (error: any) {
            this.logger.error('조직 데이터 마이그레이션 실패', error);
            throw new BadRequestException(`마이그레이션 실패: ${error.message}`);
        }
    }



    /**
     * 외부자 조직 데이터 마이그레이션
     *
     * SSO에서 EXTERNAL_DEPARTMENT_ID에 해당하는 부서(및 하위 부서)의
     * 조직 데이터만 가져와 로컬 DB에 저장합니다.
     */
    @Post('migrate-external-organization')
    @AuditAction({
        action: AuditActionEnum.ORG_MIGRATION,
        targetType: TargetType.SYSTEM,
    })
    @ApiOperation({
        summary: '외부자 조직 데이터 마이그레이션-테스트용',
        description:
            'SSO에서 EXTERNAL_DEPARTMENT_ID에 해당하는 부서(및 하위 부서)의 조직 데이터만 가져와 로컬 DB에 저장합니다. (부서, 직원, 직급, 직책 등)',
    })
    async migrateExternalOrganization(@Body() dto: MigrateOrganizationRequestDto): Promise<MigrateOrganizationResponseDto> {
        const externalDepartmentId = this.configService.get<string>('EXTERNAL_DEPARTMENT_ID');
        if (!externalDepartmentId) {
            throw new BadRequestException('EXTERNAL_DEPARTMENT_ID 환경변수가 설정되지 않았습니다.');
        }

        try {
            const result = await this.organizationMigrationService.외부조직만마이그레이션한다(
                externalDepartmentId,
                {
                    includeTerminated: dto.includeTerminated,
                    includeInactiveDepartments: dto.includeInactiveDepartments,
                },
            );

            return {
                success: result.success,
                statistics: result.statistics,
            };
        } catch (error: any) {
            this.logger.error('외부자 조직 데이터 마이그레이션 실패', error);
            throw new BadRequestException(`외부자 마이그레이션 실패: ${error.message}`);
        }
    }
}
