import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { PrimengComponentsModule } from '../../shared/primeng-components-module';
import { TranslateModule } from '@ngx-translate/core';
import { ElectronServicesCustom } from '../../service/electron-services-custom';
import { UserStateService } from '../../service/user-state.service';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { verifyLicenseResponse } from '../../models/response/verifyLicenseResponse';

@Component({
  selector:    'app-master',
  imports:     [RouterOutlet, PrimengComponentsModule, TranslateModule, CommonModule, FormsModule],
  templateUrl: './master.html',
  styleUrl:    './master.scss',
})
export class Master implements OnInit {

  items: MenuItem[] | undefined;
  public subscriptions = new Subscription();

  public isLoginRequired: boolean = false;
  public verifyLicenseResponse: verifyLicenseResponse = new verifyLicenseResponse();
  public deviceId: string = '';

  // ── Login ─────────────────────────────────────────────────────────────
  public loginEmail:     string  = '';
  public loginPassword:  string  = '';
  public loginLoading:   boolean = false;
  public loginError:     string  = '';
  public loginSuccess:   boolean = false;
  public loginFirstName: string  = '';

  // ── Register ──────────────────────────────────────────────────────────
  public showRegister:    boolean = false;
  public registerLoading: boolean = false;
  public registerError:   string  = '';
  public registerSuccess: boolean = false;
  public registerForm = {
    first_name:       '',
    last_name:        '',
    email:            '',
    phone_number:     '',
    company_name:     '',
    password:         '',
    confirm_password: '',
  };

  public email: string = 'aatmanbhoraniya12@gmail.com';
  isSidebarCollapsed = false;

  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'pi pi-home',  routerLink: '/image' },
    { label: 'Users',     icon: 'pi pi-users', routerLink: '/users' },
    { label: 'Settings',  icon: 'pi pi-cog',   routerLink: '/'      }
  ];

  constructor(
    public electronServiceCustom: ElectronServicesCustom,
    private userState: UserStateService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    setTimeout(() => { this.validateLogin(); }, 1000);
  }

  // ── Password strength ─────────────────────────────────────────────────
  get passwordStrength(): 'weak' | 'medium' | 'strong' {
    const p = this.registerForm.password;
    if (!p || p.length < 8)  return 'weak';
    const hasUpper   = /[A-Z]/.test(p);
    const hasLower   = /[a-z]/.test(p);
    const hasNumber  = /[0-9]/.test(p);
    const hasSpecial = /[^A-Za-z0-9]/.test(p);
    const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
    if (score >= 3) return 'strong';
    if (score >= 2) return 'medium';
    return 'weak';
  }

  // ── Auth ──────────────────────────────────────────────────────────────

  async validateLogin() {
    try {
      const raw      = await this.electronServiceCustom.validateLogin();
      const response = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (response.success) {
        this.isLoginRequired = false;
        this.verifyLicenseResponse.success    = true;
        this.verifyLicenseResponse.first_name = response.user?.first_name || '';
        this.verifyLicenseResponse.email      = response.user?.email      || '';
        this.userState.setUser(response.user);
      } else {
        this.isLoginRequired = true;
        this.loginError      = '';
      }
    } catch {
      this.isLoginRequired = true;
      this.loginError = 'Connection error. Please try again.';
    }
    this.cdr.markForCheck();
  }

  async submitLogin() {
    if (!this.loginEmail || !this.loginPassword) {
      this.loginError = 'Please enter your email and password.';
      return;
    }
    this.loginLoading = true;
    this.loginError   = '';
    try {
      const raw      = await this.electronServiceCustom.login(this.loginEmail, this.loginPassword);
      const response = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (response.success) {
        this.loginFirstName = response.user?.first_name || 'there';
        this.loginSuccess   = true;
        this.userState.setUser(response.user);
        setTimeout(() => {
          this.isLoginRequired = false;
          this.loginSuccess    = false;
          this.loginPassword   = '';
          this.verifyLicenseResponse.success    = true;
          this.verifyLicenseResponse.first_name = response.user?.first_name || '';
          this.verifyLicenseResponse.email      = response.user?.email      || '';
          this.cdr.markForCheck();
        }, 1500);
      } else {
        this.loginError = response.message || 'Login failed. Please try again.';
      }
    } catch {
      this.loginError = 'Connection error. Please try again.';
    }
    this.loginLoading = false;
    this.cdr.markForCheck();
  }

  async logout() {
    await this.electronServiceCustom.logout();
    this.isLoginRequired = true;
    this.loginEmail      = '';
    this.loginPassword   = '';
    this.loginError      = '';
    this.userState.clear();
    this.cdr.markForCheck();
  }

  // ── Register ──────────────────────────────────────────────────────────

  openRegister() {
    this.showRegister    = true;
    this.registerError   = '';
    this.registerSuccess = false;
    this.registerForm    = {
      first_name: '', last_name: '', email: '',
      phone_number: '', company_name: '',
      password: '', confirm_password: '',
    };
    this.cdr.markForCheck();
  }

  closeRegister() {
    this.showRegister  = false;
    this.registerError = '';
    this.cdr.markForCheck();
  }

  async submitRegister() {
    const f = this.registerForm;

    // ── UI validations ────────────────────────────────────────────────
    if (!f.first_name.trim() || !f.last_name.trim()) {
      this.registerError = 'First name and last name are required.';
      return;
    }
    if (!f.email.trim() || !f.email.includes('@')) {
      this.registerError = 'Please enter a valid email address.';
      return;
    }
    if (!f.password) {
      this.registerError = 'Password is required.';
      return;
    }
    if (f.password.length < 8) {
      this.registerError = 'Password must be at least 8 characters.';
      return;
    }
    if (f.password !== f.confirm_password) {
      this.registerError = 'Passwords do not match.';
      return;
    }

    this.registerLoading = true;
    this.registerError   = '';
    this.cdr.markForCheck();

    try {
      // ── Get device ID from Python ─────────────────────────────────
      const deviceId = await this.electronServiceCustom.getDeviceId();

      // ── Call register-request via Python api ─────────────────────
      const result = await this.electronServiceCustom.registerRequest(
        f.first_name.trim(),
        f.last_name.trim(),
        f.email.trim().toLowerCase(),
        f.phone_number.trim(),
        f.company_name.trim(),
        f.password,
        deviceId,
      );

      this.ngZone.run(() => {
        if (result.success) {
          this.registerSuccess = true;
          // Clear sensitive data from memory
          this.registerForm.password         = '';
          this.registerForm.confirm_password = '';
        } else {
          this.registerError = result.message || 'Failed to send request. Try again.';
        }
        this.registerLoading = false;
        this.cdr.markForCheck();
      });

    } catch (e: any) {
      this.ngZone.run(() => {
        this.registerError   = 'Network error. Please check your connection.';
        this.registerLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  // ── Misc ──────────────────────────────────────────────────────────────

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  copyDeviceId() {
    navigator.clipboard.writeText(this.deviceId);
  }
}