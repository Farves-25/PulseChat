import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Matches /app, /app/:workspaceSlug and /app/:workspaceSlug/:channelId with a
 * single route configuration so the workspace shell is not recreated when the
 * user switches channels.
 */
const workspaceMatcher: UrlMatcher = (segments: UrlSegment[]) => {
  if (segments.length === 0 || segments[0].path !== 'app') return null;

  const posParams: Record<string, UrlSegment> = {};
  if (segments[1]) posParams['workspaceSlug'] = segments[1];
  if (segments[2]) posParams['channelId'] = segments[2];

  return {
    consumed: segments,
    posParams,
  };
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    title: 'Sign in · PulseChat',
    loadComponent: () =>
      import('./features/auth/auth.component').then((component) => component.AuthComponent),
  },
  {
    matcher: workspaceMatcher,
    canActivate: [authGuard],
    title: 'PulseChat',
    loadComponent: () =>
      import('./features/workspace/workspace-shell.component').then(
        (component) => component.WorkspaceShellComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'app',
  },
];
