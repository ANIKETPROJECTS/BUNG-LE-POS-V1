import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useWebSocket } from "@/hooks/use-websocket";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DbErrorPage from "@/pages/db-error";
import DashboardPage from "@/pages/dashboard";
import BillingPage from "@/pages/billing";
import TablesPage from "@/pages/tables";
import TableManagementPage from "@/pages/table-management";
import KitchenPage from "@/pages/kitchen";
import MenuPage from "@/pages/menu";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import DeliveryPage from "@/pages/delivery";
import OnlineOrdersPage from "@/pages/online-orders";
import CustomersPage from "@/pages/customers";
import LoyaltyPage from "@/pages/loyalty";
import InventoryPage from "@/pages/inventory";
import InventoryHistoryPage from "@/pages/inventory-history";
import PurchaseOrdersPage from "@/pages/purchase-orders";
import SuppliersPage from "@/pages/suppliers";
import StaffPage from "@/pages/staff";
import AttendancePage from "@/pages/attendance";
import ReservationsPage from "@/pages/reservations";
import ExpensesPage from "@/pages/expenses";
import PaymentSettlementPage from "@/pages/payment-settlement";
import AccountingPage from "@/pages/accounting";
import TaxReportsPage from "@/pages/tax-reports";
import InvoicesPage from "@/pages/invoices";
import DayEndSettlementPage from "@/pages/day-end-settlement";
import OffersPage from "@/pages/offers";
import CouponsPage from "@/pages/coupons";
import FeedbackPage from "@/pages/feedback";
import AnalyticsPage from "@/pages/analytics";
import SalesDetailedPage from "@/pages/sales-detailed";
import ItemPerformancePage from "@/pages/item-performance";
import KitchenPerformancePage from "@/pages/kitchen-performance";
import WastagePage from "@/pages/wastage";
import MultiLocationPage from "@/pages/multi-location";
import UserRolesPage from "@/pages/user-roles";
import AuditLogsPage from "@/pages/audit-logs";
import NotificationsPage from "@/pages/notifications";
import HelpPage from "@/pages/help";
import ProfilePage from "@/pages/profile";
import BackupPage from "@/pages/backup";
import QRCodesPage from "@/pages/qr-codes";
import WaitingListPage from "@/pages/waiting-list";
import EventsPage from "@/pages/events";
import GiftCardsPage from "@/pages/gift-cards";
import CommissionPage from "@/pages/commission";
import PrinterConfigPage from "@/pages/printer-config";
import EmailTemplatesPage from "@/pages/email-templates";
import MarketingPage from "@/pages/marketing";
import IntegrationsPage from "@/pages/integrations";
import DatabasePage from "@/pages/database";
import DigitalMenuOrdersPage from "@/pages/digital-menu-orders";
import KOTPage from "@/pages/kot";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && location !== "/login" && location !== "/db-error") {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/db-error" component={DbErrorPage} />
      <Route path="/">{() => <ProtectedRoute component={DashboardPage} />}</Route>
      <Route path="/billing">{() => <ProtectedRoute component={BillingPage} />}</Route>
      <Route path="/tables">{() => <ProtectedRoute component={TablesPage} />}</Route>
      <Route path="/table-management">{() => <ProtectedRoute component={TableManagementPage} />}</Route>
      <Route path="/kitchen">{() => <ProtectedRoute component={KitchenPage} />}</Route>
      <Route path="/menu">{() => <ProtectedRoute component={MenuPage} />}</Route>
      <Route path="/reports">{() => <ProtectedRoute component={ReportsPage} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={SettingsPage} />}</Route>
      <Route path="/delivery">{() => <ProtectedRoute component={DeliveryPage} />}</Route>
      <Route path="/online-orders">{() => <ProtectedRoute component={OnlineOrdersPage} />}</Route>
      <Route path="/customers">{() => <ProtectedRoute component={CustomersPage} />}</Route>
      <Route path="/loyalty">{() => <ProtectedRoute component={LoyaltyPage} />}</Route>
      <Route path="/inventory">{() => <ProtectedRoute component={InventoryPage} />}</Route>
      <Route path="/inventory-history">{() => <ProtectedRoute component={InventoryHistoryPage} />}</Route>
      <Route path="/purchase-orders">{() => <ProtectedRoute component={PurchaseOrdersPage} />}</Route>
      <Route path="/suppliers">{() => <ProtectedRoute component={SuppliersPage} />}</Route>
      <Route path="/staff">{() => <ProtectedRoute component={StaffPage} />}</Route>
      <Route path="/attendance">{() => <ProtectedRoute component={AttendancePage} />}</Route>
      <Route path="/reservations">{() => <ProtectedRoute component={ReservationsPage} />}</Route>
      <Route path="/expenses">{() => <ProtectedRoute component={ExpensesPage} />}</Route>
      <Route path="/payment-settlement">{() => <ProtectedRoute component={PaymentSettlementPage} />}</Route>
      <Route path="/accounting">{() => <ProtectedRoute component={AccountingPage} />}</Route>
      <Route path="/tax-reports">{() => <ProtectedRoute component={TaxReportsPage} />}</Route>
      <Route path="/invoices">{() => <ProtectedRoute component={InvoicesPage} />}</Route>
      <Route path="/day-end-settlement">{() => <ProtectedRoute component={DayEndSettlementPage} />}</Route>
      <Route path="/offers">{() => <ProtectedRoute component={OffersPage} />}</Route>
      <Route path="/coupons">{() => <ProtectedRoute component={CouponsPage} />}</Route>
      <Route path="/feedback">{() => <ProtectedRoute component={FeedbackPage} />}</Route>
      <Route path="/analytics">{() => <ProtectedRoute component={AnalyticsPage} />}</Route>
      <Route path="/sales-detailed">{() => <ProtectedRoute component={SalesDetailedPage} />}</Route>
      <Route path="/item-performance">{() => <ProtectedRoute component={ItemPerformancePage} />}</Route>
      <Route path="/kitchen-performance">{() => <ProtectedRoute component={KitchenPerformancePage} />}</Route>
      <Route path="/wastage">{() => <ProtectedRoute component={WastagePage} />}</Route>
      <Route path="/multi-location">{() => <ProtectedRoute component={MultiLocationPage} />}</Route>
      <Route path="/user-roles">{() => <ProtectedRoute component={UserRolesPage} />}</Route>
      <Route path="/audit-logs">{() => <ProtectedRoute component={AuditLogsPage} />}</Route>
      <Route path="/notifications">{() => <ProtectedRoute component={NotificationsPage} />}</Route>
      <Route path="/help">{() => <ProtectedRoute component={HelpPage} />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={ProfilePage} />}</Route>
      <Route path="/backup">{() => <ProtectedRoute component={BackupPage} />}</Route>
      <Route path="/qr-codes">{() => <ProtectedRoute component={QRCodesPage} />}</Route>
      <Route path="/waiting-list">{() => <ProtectedRoute component={WaitingListPage} />}</Route>
      <Route path="/events">{() => <ProtectedRoute component={EventsPage} />}</Route>
      <Route path="/gift-cards">{() => <ProtectedRoute component={GiftCardsPage} />}</Route>
      <Route path="/commission">{() => <ProtectedRoute component={CommissionPage} />}</Route>
      <Route path="/printer-config">{() => <ProtectedRoute component={PrinterConfigPage} />}</Route>
      <Route path="/email-templates">{() => <ProtectedRoute component={EmailTemplatesPage} />}</Route>
      <Route path="/marketing">{() => <ProtectedRoute component={MarketingPage} />}</Route>
      <Route path="/integrations">{() => <ProtectedRoute component={IntegrationsPage} />}</Route>
      <Route path="/database">{() => <ProtectedRoute component={DatabasePage} />}</Route>
      <Route path="/digital-menu-orders">{() => <ProtectedRoute component={DigitalMenuOrdersPage} />}</Route>
      <Route path="/kot">{() => <ProtectedRoute component={KOTPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  
  const isPublicRoute = location === "/login" || location === "/db-error";
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (isPublicRoute || !isAuthenticated) {
    return <>{children}</>;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties} defaultOpen={false}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-hidden flex flex-col w-full">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  useWebSocket();
  
  return (
    <AuthenticatedLayout>
      <Router />
    </AuthenticatedLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
