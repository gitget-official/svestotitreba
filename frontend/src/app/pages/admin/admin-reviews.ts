import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReviewApi } from '../../core/api';
import { REVIEW_STATUS, formatDate } from '../../core/format';
import { Review, ReviewStatus } from '../../core/models';
import { ConfirmService } from '../../shared/ui/confirm';
import { Icon } from '../../shared/ui/icon';
import { Rating } from '../../shared/ui/rating';
import { ToastService } from '../../shared/ui/toast';

/** Moderacija recenzija (FR-17). Odobravanje i odbijanje su povratne akcije, pa nema potvrde; brisanje ima. */
@Component({
  selector: 'app-admin-reviews',
  imports: [RouterLink, Icon, Rating],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container page narrow">
      <header class="page-header">
        <div>
          <h1 class="t-title-1">Recenzije</h1>
          <p class="muted">Recenzije su vidljive tek nakon odobrenja.</p>
        </div>
      </header>

      <div class="segmented filter" role="tablist">
        @for (s of statuses; track s) {
          <button type="button" role="tab" [class.is-active]="status() === s" (click)="setStatus(s)">{{ labels[s].label }}</button>
        }
      </div>

      <div class="stack">
        @for (r of reviews(); track r.id) {
          <article class="card card-pad stack-sm enter">
            <div class="row">
              <div class="grow">
                <a class="vendor" [routerLink]="['/ponudjaci', r.vendorId]">{{ r.vendorName }}</a>
                <p class="t-footnote muted">{{ r.userFullName }} · {{ date(r.createdAt) }}</p>
              </div>
              <app-rating [value]="r.rating" />
            </div>
            @if (r.comment) { <p class="comment">{{ r.comment }}</p> } @else { <p class="subtle">Bez komentara.</p> }
            <div class="form-actions">
              <button type="button" class="btn btn-plain btn-sm danger" (click)="remove(r)">Obriši</button>
              @if (r.status !== 'Rejected') {
                <button type="button" class="btn btn-sm" (click)="reject(r)"><app-icon name="close" /> Odbij</button>
              }
              @if (r.status !== 'Approved') {
                <button type="button" class="btn btn-primary btn-sm" (click)="approve(r)"><app-icon name="check" /> Odobri</button>
              }
            </div>
          </article>
        } @empty {
          <div class="empty-state">
            <app-icon name="shield" />
            <h3 class="t-title-3">{{ status() === 'Pending' ? 'Sve je pregledano' : 'Nema recenzija' }}</h3>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .narrow { max-width: 48rem; }
    .filter { margin-bottom: var(--space-5); }
    .grow { flex: 1; }
    .vendor { color: var(--text); font-weight: 600; }
    .comment { white-space: pre-line; }
    .danger { --btn-fg: var(--danger); }
  `,
})
export class AdminReviews implements OnInit {
  private readonly api = inject(ReviewApi);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly statuses: ReviewStatus[] = ['Pending', 'Approved', 'Rejected'];
  protected readonly labels = REVIEW_STATUS;
  protected readonly status = signal<ReviewStatus>('Pending');
  protected readonly reviews = signal<Review[]>([]);
  protected readonly date = (v: string) => formatDate(v);

  ngOnInit(): void {
    this.load();
  }

  protected setStatus(status: ReviewStatus): void {
    this.status.set(status);
    this.load();
  }

  protected approve(review: Review): void {
    this.api.approve(review.id).subscribe(() => {
      this.toasts.success('Recenzija je objavljena.');
      this.drop(review);
    });
  }

  protected reject(review: Review): void {
    this.api.reject(review.id).subscribe(() => {
      this.toasts.info('Recenzija je odbijena.');
      this.drop(review);
    });
  }

  protected async remove(review: Review): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Obrisati recenziju?', message: 'Recenzija će biti trajno obrisana.' });
    if (!ok) return;
    this.api.remove(review.id).subscribe(() => this.drop(review));
  }

  private drop(review: Review): void {
    this.reviews.update((list) => list.filter((r) => r.id !== review.id));
  }

  private load(): void {
    this.api.list({ status: this.status(), pageSize: 100 }).subscribe((r) => this.reviews.set(r.items));
  }
}
