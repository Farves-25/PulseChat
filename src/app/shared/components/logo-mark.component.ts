import { Component, input } from '@angular/core';

@Component({
  selector: 'app-logo-mark',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="PulseChat logo"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stop-color="var(--accent)" />
          <stop offset="1" stop-color="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" [attr.fill]="'url(#' + gradientId + ')'" />
      <path
        d="M11 25.5h6.2l2.6-7.1 4.6 13.2 3.4-9.2 2.2 3.1H37"
        stroke="white"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.96"
      />
      <circle cx="37" cy="25.5" r="2.3" fill="white" opacity="0.9" />
    </svg>
  `,
})
export class LogoMarkComponent {
  readonly size = input(34);
  protected readonly gradientId = `pulse-logo-${Math.random().toString(36).slice(2, 9)}`;
}
