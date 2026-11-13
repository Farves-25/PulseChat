import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isAuthenticated() ? true : router.createUrlTree(['/auth']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;

  // If user arrived via a password reset/recovery link, allow them to access /auth to set new password
  if (
    typeof window !== 'undefined' &&
    (window.location.href.includes('type=recovery') ||
      window.location.search.includes('reset=true') ||
      auth.isPasswordRecovery())
  ) {
    return true;
  }

  return auth.isAuthenticated() ? router.createUrlTree(['/app']) : true;
};
