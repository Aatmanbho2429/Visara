import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrimengComponentsModule } from '../../shared/primeng-components-module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ElectronServicesCustom } from '../../service/electron-services-custom';
import { SystemService } from '../../service/system-service';
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
export class ImageSearch implements OnInit {

  @ViewChild(ProgressBarComponent) progressBar!: ProgressBarComponent;

  public results: SearchResult[]         = [];
  public queryString: string             = '';
  public folderPath: string              = '';
  public number_of_results: number       = 30;
  events: string[];
  public currentStep: number             = 1;
  public subscriptions                   = new Subscription();
  public isSearching: boolean            = false;
  public displayMembershipPopup: boolean = false;
  numberOFResults: any[] | undefined;
  selectedResultNumber: any | undefined;

  // ── Subscription state ────────────────────────────────────────────────
  public showSubscriptionScreen: boolean = false;
  public subscriptionStatus: string      = 'trial';
  public freeSearchesRemaining: number   = 10;
  public daysRemaining: number | null    = null;
  public plans: any[]                    = [];
  public selectedPlan: any               = null;
  public paymentLoading: boolean         = false;
  public userId: string                  = '';

  constructor(
    public electronServiceCustom: ElectronServicesCustom,
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
    setTimeout(() => {
      this.ngZone.run(() => { this.loadSubscriptionState(); });
    }, 1000);
  }

  loadSubscriptionState() {
    try {
      const userStr = sessionStorage.getItem('visara_user');
      console.log('Loaded user from sessionStorage:', userStr);
      if (userStr) {
        const user = JSON.parse(userStr);
        this.userId                = user.id                      || '';
        this.subscriptionStatus    = user.subscription_status     || 'trial';
        this.freeSearchesRemaining = user.free_searches_remaining ?? 10;
        this.daysRemaining         = user.days_remaining          ?? null;
      }
    } catch { }
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
    let a = await this.electronServiceCustom.OpenFolderDialog();
    this.ngZone.run(() => { this.folderPath = a; });
    this.cdr.detectChanges();
  }

  async selectImagePath() {
    let a = await this.electronServiceCustom.OpenFileDialog();
    this.ngZone.run(() => { this.queryString = this.fixPath(a); });
    this.cdr.detectChanges();
  }

  async addFolderToVectroDb() {
    if (!this.folderPath || !this.queryString) {
      this.systemService.showWarning('Please select a folder and enter a search query.');
      return;
    }

    // ── START LOADING IMMEDIATELY on button click ─────────────────────
    this.ngZone.run(() => {
      this.isSearching = true;
      this.results     = [];
    });
    this.progressBar?.startPolling();

    // ── Check subscription BEFORE searching ───────────────────────────
    if (this.userId) {
      const decResp = await this.electronServiceCustom.decrementSearch(this.userId);
      console.log('decResp:', decResp);

      if (!decResp.success) {
        // Exhausted or expired — stop loading, show subscription screen
        this.ngZone.run(() => {
          this.isSearching            = false;
          this.subscriptionStatus     = decResp.subscription_status;
          this.showSubscriptionScreen = true;
          this.loadPlans();
        });
        this.progressBar?.stopPolling();
        return;
      }

      // Update local count
      this.ngZone.run(() => {
        this.subscriptionStatus    = decResp.subscription_status;
        this.freeSearchesRemaining = decResp.free_searches_remaining ?? this.freeSearchesRemaining;
        this.daysRemaining         = decResp.days_remaining          ?? this.daysRemaining;
        try {
          const userStr = sessionStorage.getItem('visara_user');
          if (userStr) {
            const user = JSON.parse(userStr);
            user.subscription_status     = this.subscriptionStatus;
            user.free_searches_remaining = this.freeSearchesRemaining;
            user.days_remaining          = this.daysRemaining;
            sessionStorage.setItem('visara_user', JSON.stringify(user));
          }
        } catch { }
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

      this.ngZone.run(async () => {
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
      }
    });
  }

  async buyPlan() {
    if (!this.selectedPlan || !this.userId) return;
    this.paymentLoading = true;

    try {
      const orderResp = await this.electronServiceCustom.createOrder(
        this.userId, this.selectedPlan.id
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
            this.userId,
            this.selectedPlan.id
          );
          this.ngZone.run(() => {
            if (verifyResp.success) {
              this.subscriptionStatus     = 'active';
              this.daysRemaining          = verifyResp.days_remaining;
              this.freeSearchesRemaining  = 0;
              this.showSubscriptionScreen = false;
              this.paymentLoading         = false;
              try {
                const userStr = sessionStorage.getItem('visara_user');
                if (userStr) {
                  const user = JSON.parse(userStr);
                  user.subscription_status     = 'active';
                  user.subscription_end        = verifyResp.subscription_end;
                  user.days_remaining          = verifyResp.days_remaining;
                  sessionStorage.setItem('visara_user', JSON.stringify(user));
                }
              } catch { }
              this.systemService.showSuccess(
                `${this.selectedPlan.name} plan activated! ${verifyResp.days_remaining} days remaining.`
              );
              this.cdr.detectChanges();
            } else {
              this.systemService.showError(verifyResp.message || 'Payment verification failed');
              this.paymentLoading = false;
              this.cdr.detectChanges();
            }
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
    const script    = document.createElement('script');
    script.src      = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload   = () => {
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
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
      item.thumbnail = await this.electronServiceCustom.getThumbnail(item.path);
    }
  }
}

interface SearchResult {
  path:       string;
  score:      number;
  thumbnail?: string;
}