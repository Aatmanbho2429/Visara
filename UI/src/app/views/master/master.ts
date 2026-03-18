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

  public loginEmail:     string  = '';
  public loginPassword:  string  = '';
  public loginLoading:   boolean = false;
  public loginError:     string  = '';
  public loginSuccess:   boolean = false;
  public loginFirstName: string  = '';

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

  async validateLogin() {
    try {
      const raw      = await this.electronServiceCustom.validateLogin();
      const response = typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (response.success) {
        this.isLoginRequired = false;
        this.verifyLicenseResponse.success    = true;
        this.verifyLicenseResponse.first_name = response.user?.first_name || '';
        this.verifyLicenseResponse.email      = response.user?.email      || '';
        // ── Save to shared state service ───────────────────────────
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
        this.isLoginRequired = false;
        this.verifyLicenseResponse.success    = true;
        this.verifyLicenseResponse.first_name = response.user?.first_name || '';
        this.verifyLicenseResponse.email      = response.user?.email      || '';
        this.loginPassword = '';
        // ── Save to shared state service ───────────────────────────
        this.userState.setUser(response.user);
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
    // ── Clear shared state ─────────────────────────────────────────
    this.userState.clear();
    this.cdr.markForCheck();
  }

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  copyDeviceId() {
    navigator.clipboard.writeText(this.deviceId);
  }
}