import { Controller, Post, Body, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SSOService } from '../../../integrations/sso/sso.service';
import { GenerateTokenRequestDto, GenerateTokenResponseDto } from './dto/generate-token.dto';
import { VerifyTokenRequestDto, VerifyTokenResponseDto } from './dto/verify-token.dto';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { MigrateOrganizationRequestDto, MigrateOrganizationResponseDto } from './dto/migrate-organization.dto';

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
    ) {}

    /**
     * SSO 로그인
     *
     * SSO를 통해 로그인하고 JWT 토큰을 발급합니다.
     */
    @Post('login')
    @ApiOperation({
        summary: 'SSO 로그인',
        description: 'SSO를 통해 로그인하고 JWT 토큰을 발급합니다.',
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

            // JWT 토큰 생성
            const jwtPayload = {
                id: employee.id,
                employeeNumber: employee.employeeNumber,
                name: employee.name,
                email: employee.email,
            };

            const token = this.jwtService.sign(jwtPayload);

            return {
                success: true,
                token,
                user: {
                    id: employee.id,
                    employeeNumber: employee.employeeNumber,
                    name: employee.name,
                    email: employee.email,
                },
                ssoToken: {
                    accessToken: ssoResponse.accessToken,
                    refreshToken: ssoResponse.refreshToken,
                },
            };
        } catch (error: any) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException(`로그인 실패: ${error.message || '알 수 없는 오류'}`);
        }
    }

    /**
     * SSO 토큰 갱신
     *
     * SSO 리프레시 토큰을 사용하여 새로운 토큰을 발급받습니다.
     */
    @Post('refresh-token')
    @ApiOperation({
        summary: 'SSO 토큰 갱신',
        description: 'SSO 리프레시 토큰을 사용하여 새로운 액세스 토큰과 JWT 토큰을 발급받습니다.',
    })
    async refreshToken(@Body() dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
        try {
            // SSO 토큰 갱신
            const ssoResponse = await this.ssoService.refreshToken(dto.refreshToken);

            // SSO 응답에서 직원 번호 추출
            if (!ssoResponse.employeeNumber) {
                throw new UnauthorizedException('SSO 토큰 갱신 응답에 직원 번호가 없습니다.');
            }

            // SSO를 통해 직원 상세 정보 조회
            const employee = await this.ssoService.getEmployee({
                employeeNumber: ssoResponse.employeeNumber,
                withDetail: true,
            });

            // 새로운 JWT 토큰 생성
            const jwtPayload = {
                id: employee.id,
                employeeNumber: employee.employeeNumber,
                name: employee.name,
                email: employee.email,
            };

            const token = this.jwtService.sign(jwtPayload);

            return {
                success: true,
                token,
                user: {
                    id: employee.id,
                    employeeNumber: employee.employeeNumber,
                    name: employee.name,
                    email: employee.email,
                },
                ssoToken: {
                    accessToken: ssoResponse.accessToken,
                    refreshToken: ssoResponse.refreshToken,
                },
            };
        } catch (error: any) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException(`토큰 갱신 실패: ${error.message || '알 수 없는 오류'}`);
        }
    }

    /**
     * JWT 토큰 생성
     *
     * 만료시간 없이 유효한 JWT 토큰을 생성합니다.
     */
    @Post('generate-token')
    @ApiOperation({
        summary: 'JWT 토큰 생성',
        description: '만료시간 없이 유효한 JWT 토큰을 생성합니다.',
    })
    async generateToken(@Body() dto: GenerateTokenRequestDto): Promise<GenerateTokenResponseDto> {
        try {
            const payload: any = {
                employeeNumber: dto.employeeNumber,
                name: dto.name,
                email: dto.email,
                ...dto.additionalData,
            };

            // 만료시간 없이 토큰 생성
            const token = this.jwtService.sign(payload);

            return {
                success: true,
                token,
                tokenInfo: {
                    employeeNumber: dto.employeeNumber,
                    name: dto.name,
                    email: dto.email,
                    issuedAt: new Date(),
                    expiresAt: undefined, // 만료시간 없음
                },
                usage: `Authorization: Bearer ${token}`,
            };
        } catch (error: any) {
            throw new BadRequestException(`토큰 생성 실패: ${error.message}`);
        }
    }

    /**
     * JWT 토큰 검증
     *
     * JWT 토큰의 유효성을 검증하고 payload를 반환합니다.
     */
    @Post('verify-token')
    @ApiOperation({
        summary: 'JWT 토큰 검증',
        description: 'JWT 토큰의 유효성을 검증하고 payload를 반환합니다.',
    })
    async verifyToken(@Body() dto: VerifyTokenRequestDto): Promise<VerifyTokenResponseDto> {
        try {
            const secret =
                this.configService.get<string>('JWT_SECRET') || this.configService.get<string>('GLOBAL_SECRET');

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
                    id: payload.id,
                    employeeNumber: payload.employeeNumber,
                    name: payload.name,
                    email: payload.email,
                    iat: payload.iat, // iat: 토큰이 발급된 시간(issued at)
                    exp: payload.exp, // exp: 토큰 만료 시간(expiration)
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
     * SSO에서 모든 조직 데이터를 가져옵니다.
     */
    @Post('migrate-organization')
    @ApiOperation({
        summary: '조직 데이터 마이그레이션',
        description: 'SSO에서 모든 조직 데이터를 가져옵니다. (부서, 직원, 직급, 직책 등)',
    })
    async migrateOrganization(@Body() dto: MigrateOrganizationRequestDto): Promise<MigrateOrganizationResponseDto> {
        try {
            this.logger.log('SSO 조직 데이터 마이그레이션 시작');

            // SSO에서 모든 조직 데이터 조회
            const ssoData = await this.ssoService.exportAllData({
                includeTerminated: dto.includeTerminated,
                includeInactiveDepartments: dto.includeInactiveDepartments,
            });

            this.logger.log(
                `SSO 데이터 조회 완료: 부서 ${ssoData.totalCounts.departments}개, 직원 ${ssoData.totalCounts.employees}명, 직급 ${ssoData.totalCounts.ranks}개, 직책 ${ssoData.totalCounts.positions}개`,
            );

            return {
                success: true,
                statistics: {
                    ranks: ssoData.totalCounts.ranks,
                    positions: ssoData.totalCounts.positions,
                    departments: ssoData.totalCounts.departments,
                    employees: ssoData.totalCounts.employees,
                    employeeDepartmentPositions: ssoData.totalCounts.employeeDepartmentPositions,
                    assignmentHistories: ssoData.totalCounts.assignmentHistories,
                },
                data: {
                    ranks: ssoData.ranks,
                    positions: ssoData.positions,
                    departments: ssoData.departments,
                    employees: ssoData.employees,
                    employeeDepartmentPositions: ssoData.employeeDepartmentPositions,
                    assignmentHistories: ssoData.assignmentHistories,
                },
            };
        } catch (error: any) {
            this.logger.error('조직 데이터 마이그레이션 실패', error);
            throw new BadRequestException(`마이그레이션 실패: ${error.message}`);
        }
    }
}
