import { ChangeDetectorRef, Component, NgZone, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimengComponentsModule } from '../../shared/primeng-components-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ElectronServicesCustom } from '../../service/electron-services-custom';
import { SystemService } from '../../service/system-service';
import { UserStateService } from '../../service/user-state.service';
import { TranslateModule } from '@ngx-translate/core';
import { ProgressBarComponent } from '../progress-bar/progress-bar';

@Component({
  selector: 'app-image-search',
  imports: [
    CommonModule,
    PrimengComponentsModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ProgressBarComponent
  ],
  templateUrl: './image-search.html',
  styleUrl: './image-search.scss',
})
export class ImageSearch implements OnInit, OnDestroy {

  @ViewChild(ProgressBarComponent) progressBar!: ProgressBarComponent;

  private destroy$ = new Subject<void>();

  public results: SearchResult[]         = [];
  public queryString: string             = '';
  public folderPath: string              = '';
  public number_of_results: number       = 30;
  events: string[];
  public currentStep: number             = 1;
  public isSearching: boolean            = false;
  numberOFResults: any[] | undefined;
  selectedResultNumber: any | undefined;

  // ── Subscription UI state ─────────────────────────────────────────────
  public showSubscriptionScreen: boolean = false;
  public plans: any[]                    = [];
  public selectedPlan: any               = null;
  public paymentLoading: boolean         = false;

  constructor(
    public electronServiceCustom: ElectronServicesCustom,
    public userState: UserStateService,           // ← INJECTED ✅
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    public systemService: SystemService
  ) {
    this.currentStep = 1;
    this.events = ['Select Search Image', 'Choose Target Folder', 'Search'];
  }

  ngOnInit(): void {
    this.numberOFResults = [
      { name: '10', code: 10 },
      { name: '20', code: 20 },
      { name: '30', code: 30 },
      { name: '50', code: 50 }
    ];
    if (!this.validateStep(this.currentStep)) {
      this.currentStep = 1;
    }

    // ── Subscribe to user state — auto triggers re-render ─────────────
    this.userState.user$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  validateStep(step: number): boolean {
    if (step >= 2 && !this.queryString) return false;
    if (step >= 3 && !this.folderPath)  return false;
    return true;
  }

  goToStep(step: number, current: number) {
    if (!this.validateStep(step)) return;
    this.currentStep = step;
  }

  fixPath(p: string): string {
    return '' + p.replace('file:///', '');
  }

  async selectFolderPath() {
    const a = await this.electronServiceCustom.OpenFolderDialog();
    this.ngZone.run(() => { this.folderPath = a; });
    this.cdr.detectChanges();
  }

  async selectImagePath() {
    const a = await this.electronServiceCustom.OpenFileDialog();
    this.ngZone.run(() => { this.queryString = this.fixPath(a); });
    this.cdr.detectChanges();
  }

  async addFolderToVectroDb() {
    if (!this.folderPath || !this.queryString) {
      this.systemService.showWarning('Please select a folder and enter a search query.');
      return;
    }

    // ── START LOADING IMMEDIATELY — prevents double-click ─────────────
    this.isSearching = true;
    this.results     = [];
    this.cdr.detectChanges();
    this.progressBar?.startPolling();

    // ── Check subscription BEFORE searching ───────────────────────────
    if (this.userState.userId) {
      const decResp = await this.electronServiceCustom.decrementSearch(this.userState.userId);

      if (!decResp.success) {
        // Exhausted or expired — stop loading, show subscription screen
        this.userState.updateSubscription({
          subscription_status:     decResp.subscription_status,
          free_searches_remaining: decResp.free_searches_remaining,
          days_remaining:          decResp.days_remaining,
        });
        this.isSearching            = false;
        this.showSubscriptionScreen = true;
        this.progressBar?.stopPolling();
        this.cdr.detectChanges();
        this.loadPlans();
        return;
      }

      // Update subscription state in service — triggers re-render automatically
      this.userState.updateSubscription({
        subscription_status:     decResp.subscription_status,
        free_searches_remaining: decResp.free_searches_remaining,
        days_remaining:          decResp.days_remaining,
      });
    }
    // ── End subscription check ────────────────────────────────────────

    try {
      if (this.selectedResultNumber) {
        this.number_of_results = this.selectedResultNumber;
      }

      const response = await this.electronServiceCustom.Search(
        this.queryString,
        this.folderPath,
        this.number_of_results
      );
      const parsed = typeof response === 'string' ? JSON.parse(response) : response;

      this.ngZone.run(() => {
        if (!parsed.status) {
          this.systemService.showError(parsed.message || 'Search failed');
          return;
        }
        const resultsArray = parsed.data?.results || [];
        if (resultsArray.length > 0) {
          this.results = resultsArray.map((r: any) => ({
            path:  this.fixPath(r.path),
            score: r.similarity
          }));
          this.loadThumbnails();
          this.systemService.showSuccess(`${resultsArray.length} similar images found.`);
        } else {
          this.results = [];
          this.systemService.showWarning('No similar images found for the given query.');
        }
      });

    } catch (err: any) {
      this.systemService.showError(err?.message || 'An error occurred during the search.');
    } finally {
      setTimeout(() => this.progressBar?.stopPolling(), 1000);
      this.ngZone.run(() => {
        this.isSearching = false;
        this.cdr.detectChanges();
      });
    }
  }

  // ── Subscription ──────────────────────────────────────────────────────

  async loadPlans() {
    const resp = await this.electronServiceCustom.getPlans();
    this.ngZone.run(() => {
      if (resp.success) {
        this.plans        = resp.plans;
        this.selectedPlan = this.plans[1] || this.plans[0];
        this.cdr.detectChanges();
      }
    });
  }

  async buyPlan() {
    if (!this.selectedPlan || !this.userState.userId) return;
    this.paymentLoading = true;

    try {
      const orderResp = await this.electronServiceCustom.createOrder(
        this.userState.userId, this.selectedPlan.id
      );

      if (!orderResp.success) {
        this.systemService.showError(orderResp.message || 'Failed to create order');
        this.paymentLoading = false;
        return;
      }

      const options = {
        key:         orderResp.key_id,
        amount:      orderResp.amount,
        currency:    orderResp.currency,
        name:        'Visara',
        description: `${this.selectedPlan.name} Plan`,
        order_id:    orderResp.order_id,
        prefill: {
          name:    orderResp.user.name,
          email:   orderResp.user.email,
          contact: orderResp.user.phone,
        },
        theme: { color: '#4f46e5' },
        handler: async (response: any) => {
          const verifyResp = await this.electronServiceCustom.verifyPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
            this.userState.userId,
            this.selectedPlan.id
          );
          this.ngZone.run(() => {
            if (verifyResp.success) {
              this.userState.updateSubscription({
                subscription_status:     'active',
                free_searches_remaining: null,
                days_remaining:          verifyResp.days_remaining,
              });
              this.userState.setUser({ subscription_end: verifyResp.subscription_end });
              this.showSubscriptionScreen = false;
              this.paymentLoading         = false;
              this.systemService.showSuccess(
                `${this.selectedPlan.name} plan activated! ${verifyResp.days_remaining} days remaining.`
              );
            } else {
              this.systemService.showError(verifyResp.message || 'Payment verification failed');
              this.paymentLoading = false;
            }
            this.cdr.detectChanges();
          });
        },
      };

      this.openRazorpay(options);

    } catch (e: any) {
      this.systemService.showError(e.message || 'Payment failed');
      this.paymentLoading = false;
    }
  }

  openRazorpay(options: any) {
    const script  = document.createElement('script');
    script.src    = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', () => {
        this.ngZone.run(() => {
          this.systemService.showError('Payment failed. Please try again.');
          this.paymentLoading = false;
          this.cdr.detectChanges();
        });
      });
      rzp.open();
    };
    document.body.appendChild(script);
  }

  closeSubscriptionScreen() {
    this.showSubscriptionScreen = false;
  }

  async openFilePath(path: string) {
    await this.electronServiceCustom.OpenFilePath(path);
  }

  async loadThumbnails() {
    for (const item of this.results) {
      item.thumbnail = '';
      const result   = await this.electronServiceCustom.getThumbnail(item.path);
      // ── Show placeholder if thumbnail fails ───────────────────────
      item.thumbnail = result === 'error' ? 'assets/images/logo.png' : result;
    }
  }
}

interface SearchResult {
  path:       string;
  score:      number;
  thumbnail?: string;
}