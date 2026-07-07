import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Smartphone, MapPin, Clock, RefreshCw, Package, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import type { DigitalMenuOrder } from "@shared/schema";

const statusConfig = {
  pending: { label: "Pending", icon: AlertCircle, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  confirmed: { label: "Confirmed", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  preparing: { label: "Preparing", icon: Package, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

export default function DigitalMenuOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders = [], isLoading, refetch } = useQuery<DigitalMenuOrder[]>({
    queryKey: ["/api/digital-menu/orders"],
  });

  const { data: syncStatus } = useQuery<{ isRunning: boolean; processedOrders: number }>({
    queryKey: ["/api/digital-menu/status"],
    refetchInterval: 1000,
  });

  const filteredOrders = orders.filter(order => 
    statusFilter === "all" || order.status === statusFilter
  );

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} gap-1`} variant="secondary">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | Date) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd/MM/yyyy HH:mm");
    } catch {
      return "Invalid date";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Digital Menu Orders</h1>
          <p className="text-sm text-muted-foreground">
            Real-time orders from customer digital menus
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {syncStatus && (
            <Badge variant="secondary" className="gap-1">
              <div className={`h-2 w-2 rounded-full ${syncStatus.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              {syncStatus.isRunning ? 'Syncing Active' : 'Sync Stopped'}
              {syncStatus.processedOrders > 0 && ` (${syncStatus.processedOrders} orders)`}
            </Badge>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            data-testid="button-refresh-orders"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="text-sm text-muted-foreground">
          Showing {filteredOrders.length} of {orders.length} orders
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Loading orders...
          </CardContent>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No orders found
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredOrders.map((order) => (
            <Card key={order._id} data-testid={`card-order-${order._id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                      {order.customerName}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3" />
                        {order.customerPhone}
                      </span>
                      {order.tableNumber && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Table {order.tableNumber}
                          {order.floorNumber && ` - ${order.floorNumber}`}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(order.orderDate || order.createdAt)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(order.status)}
                    <div className="text-right">
                      <div className="text-lg font-semibold">₹{(order.total || 0).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.paymentStatus === 'paid' ? 'Paid' : 'Pending Payment'}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(order.items || []).map((item, idx) => (
                      <TableRow key={idx} data-testid={`row-item-${idx}`}>
                        <TableCell className="font-medium">{item.menuItemName || 'Unknown Item'}</TableCell>
                        <TableCell className="text-center">{item.quantity || 0}</TableCell>
                        <TableCell className="text-right">₹{(item.price || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">₹{(item.total || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.spiceLevel && (
                            <span className="mr-2">Spice: {item.spiceLevel}</span>
                          )}
                          {item.notes && <span>{item.notes}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={3} className="text-right font-medium">Subtotal:</TableCell>
                      <TableCell className="text-right">₹{(order.subtotal || 0).toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-medium">Tax:</TableCell>
                      <TableCell className="text-right">₹{(order.tax || 0).toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="font-bold">
                      <TableCell colSpan={3} className="text-right">Total:</TableCell>
                      <TableCell className="text-right text-lg">₹{(order.total || 0).toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
