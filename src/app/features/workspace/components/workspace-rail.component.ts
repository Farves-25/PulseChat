import { Component, computed, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { LucideMoon, LucidePlus, LucideSun } from '@lucide/angular';
import { ThemeService } from '../../../core/services/theme.service';
import { ChatStateService } from '../../../core/services/chat-state.service';
import { Workspace } from '../../../core/models';
import { LogoMarkComponent } from '../../../shared/components/logo-mark.component';
import { initialsFor } from '../../../shared/utils/avatar';

@Component({
  selector: 'app-workspace-rail',
  imports: [LogoMarkComponent, LucideMoon, LucidePlus, LucideSun],
  templateUrl: './workspace-rail.component.html',
})
export class WorkspaceRailComponent {
  readonly createWorkspace = output<void>();

  protected readonly state = inject(ChatStateService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly workspaces = this.state.workspaces;
  protected readonly activeId = computed(() => this.state.activeWorkspace()?.id ?? null);

  protected select(workspace: Workspace): void {
    if (workspace.id === this.activeId()) return;
    void this.state.switchWorkspace(workspace.id);
  }

  protected isActive(workspace: Workspace): boolean {
    return workspace.id === this.activeId();
  }

  protected initials(workspace: Workspace): string {
    return initialsFor(workspace.name);
  }

  protected goHome(): void {
    void this.router.navigate(['/app']);
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }
}
