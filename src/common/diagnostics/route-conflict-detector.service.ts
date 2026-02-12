import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/**
 * 앱 시작 시 라우트 충돌을 자동 감지하는 서비스
 *
 * 같은 HTTP method + 같은 path level에서 와일드카드 라우트(:param)가
 * 정적 라우트보다 먼저 등록되어 있으면 경고합니다.
 *
 * 예: GET /v1/items/:id 가 GET /v1/items/search 보다 먼저 등록되면
 *     "search" 요청이 :id로 잘못 매칭될 수 있습니다.
 */
interface RegisteredRoute {
  method: string;
  path: string;
  order: number;
}

interface RouteConflict {
  wildcardRoute: RegisteredRoute;
  shadowedRoute: RegisteredRoute;
  conflictSegment: string;
}

@Injectable()
export class RouteConflictDetectorService implements OnApplicationBootstrap {
  private readonly logger = new Logger('RouteConflictDetector');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onApplicationBootstrap(): void {
    try {
      const server = this.httpAdapterHost.httpAdapter.getInstance();
      const routes = this.extractRoutes(server);
      const conflicts = this.detectConflicts(routes);
      this.reportResults(conflicts);
    } catch (error) {
      this.logger.warn(
        `라우트 충돌 감지를 실행할 수 없습니다: ${error.message}`,
      );
    }
  }

  /**
   * Express 라우터 스택에서 등록된 라우트를 추출합니다.
   * 등록 순서(order)가 라우트 매칭 우선순위를 결정합니다.
   */
  private extractRoutes(server: any): RegisteredRoute[] {
    const routes: RegisteredRoute[] = [];
    const stack = server._router?.stack || [];

    let order = 0;
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods);
        for (const method of methods) {
          routes.push({
            method: method.toUpperCase(),
            path: layer.route.path,
            order: order++,
          });
        }
      }
    }

    return routes;
  }

  /**
   * 와일드카드 라우트가 정적 라우트를 가릴(shadow) 수 있는 케이스를 찾습니다.
   *
   * 조건:
   * 1. 같은 HTTP method
   * 2. 같은 segment 수
   * 3. 와일드카드 라우트가 정적 라우트보다 먼저 등록됨
   * 4. 와일드카드 위치에 정적 라우트는 고정 문자열을 가짐
   */
  private detectConflicts(routes: RegisteredRoute[]): RouteConflict[] {
    const conflicts: RouteConflict[] = [];

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        if (routes[i].method !== routes[j].method) continue;

        const conflict = this.checkShadow(routes[i], routes[j]);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * 라우트 A가 라우트 B를 가리는지(shadow) 확인합니다.
   * A가 B보다 먼저 등록되어 있고, A의 와일드카드가 B의 정적 segment를 삼킬 수 있으면 충돌입니다.
   */
  private checkShadow(
    earlier: RegisteredRoute,
    later: RegisteredRoute,
  ): RouteConflict | null {
    const aSegs = earlier.path.split('/').filter(Boolean);
    const bSegs = later.path.split('/').filter(Boolean);

    if (aSegs.length !== bSegs.length) return null;

    let conflictSegment: string | null = null;

    for (let i = 0; i < aSegs.length; i++) {
      const aIsWild = aSegs[i].startsWith(':');
      const bIsWild = bSegs[i].startsWith(':');

      if (aIsWild && !bIsWild) {
        // A의 와일드카드가 B의 정적 segment를 삼킬 수 있음
        conflictSegment = bSegs[i];
      } else if (!aIsWild && bIsWild) {
        // A가 정적이고 B가 와일드카드 — shadow 아님
        return null;
      } else if (!aIsWild && !bIsWild && aSegs[i] !== bSegs[i]) {
        // 서로 다른 정적 segment — 충돌 없음
        return null;
      }
    }

    if (conflictSegment) {
      return {
        wildcardRoute: earlier,
        shadowedRoute: later,
        conflictSegment,
      };
    }

    return null;
  }

  private reportResults(conflicts: RouteConflict[]): void {
    if (conflicts.length === 0) {
      this.logger.log('✓ 라우트 충돌 없음 — 모든 정적 라우트가 안전합니다.');
      return;
    }

    this.logger.error(
      `⚠ ${conflicts.length}개의 라우트 충돌 감지! 요청이 잘못된 핸들러로 라우팅될 수 있습니다.`,
    );

    for (const c of conflicts) {
      this.logger.error(
        `  충돌: ${c.wildcardRoute.method} ${c.wildcardRoute.path} (순서: ${c.wildcardRoute.order})` +
          ` → "${c.conflictSegment}" 요청을 가로챔` +
          ` → 의도된 라우트: ${c.shadowedRoute.method} ${c.shadowedRoute.path} (순서: ${c.shadowedRoute.order})`,
      );
    }

    this.logger.error(
      '  해결: interface.module.ts에서 정적 라우트 컨트롤러를 와일드카드 컨트롤러보다 먼저 등록하세요.',
    );
  }
}
