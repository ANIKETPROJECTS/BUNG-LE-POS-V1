import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import TableCard from "@/components/TableCard";
import ReservationDialog from "@/components/ReservationDialog";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Table, Order, Floor, Reservation } from "@shared/schema";

interface TableWithOrder extends Table {
  orderStartTime?: string | null;
}

export default function TablesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableWithOrder | null>(null);
  const [orderDetails, setOrderDetails] = useState<any[]>([]);
  
  const [showAddFloorDialog, setShowAddFloorDialog] = useState(false);
  const [showAddTableDialog, setShowAddTableDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editMode, setEditMode] = useState<"floors" | "tables">("floors");
  const [showReservationDialog, setShowReservationDialog] = useState(false);
  const [selectedTableForReservation, setSelectedTableForReservation] = useState<string | null>(null);
  const [isReservationMode, setIsReservationMode] = useState(false);
  
  const [floorName, setFloorName] = useState("");
  const [tableNumber, setTableNumber] = useState("");
  const [tableSeats, setTableSeats] = useState("4");
  const [selectedFloorId, setSelectedFloorId] = useState("");

  const { data: tables = [], isLoading: tablesLoading } = useQuery<Table[]>({
    queryKey: ["/api/tables"],
  });

  const { data: floors = [], isLoading: floorsLoading } = useQuery<Floor[]>({
    queryKey: ["/api/floors"],
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
  });

  const { data: reservations = [] } = useQuery<Reservation[]>({
    queryKey: ["/api/reservations"],
  });

  const isLoading = tablesLoading || floorsLoading;

  const tablesWithOrders = useMemo(() => {
    if (!tables.length) {
      return [];
    }
    
    return tables.map((table) => {
      const tableOrder = orders.find((order) => order.id === table.currentOrderId);
      return {
        ...table,
        orderStartTime: tableOrder?.createdAt ? String(tableOrder.createdAt) : null,
      };
    });
  }, [tables, orders]);

  const markServedMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const table = tablesWithOrders.find((t) => t.id === tableId);
      if (!table || !table.currentOrderId) return;

      const orderItemsRes = await fetch(`/api/orders/${table.currentOrderId}/items`);
      const orderItems = await orderItemsRes.json();

      await Promise.all(
        orderItems.map((item: any) =>
          apiRequest("PATCH", `/api/order-items/${item.id}/status`, { status: "served" })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/active"] });
    },
  });

  const createFloorMutation = useMutation({
    mutationFn: async (data: { name: string; displayOrder: number }) => {
      const res = await apiRequest("POST", "/api/floors", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      setShowAddFloorDialog(false);
      setFloorName("");
      toast({ title: "Floor created successfully" });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: { tableNumber: string; seats: number; floorId: string | null }) => {
      const res = await apiRequest("POST", "/api/tables", { ...data, status: "free" });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setShowAddTableDialog(false);
      setTableNumber("");
      setTableSeats("4");
      setSelectedFloorId("");
      toast({ title: "Table created successfully" });
    },
  });

  const deleteFloorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/floors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      toast({ title: "Floor deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Cannot delete floor", 
        description: error.message || "Please move or delete all tables from this floor first",
        variant: "destructive" 
      });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Table deleted successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Cannot delete table", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const handleTableClick = async (id: string) => {
    const table = tablesWithOrders.find((t) => t.id === id);
    if (!table) return;

    if (isReservationMode) {
      setSelectedTableForReservation(id);
      setShowReservationDialog(true);
      return;
    }

    const floor = floors.find((f) => f.id === table.floorId);
    const floorName = floor?.name || "";

    if (table.status === "reserved") {
      setSelectedTableForReservation(id);
      setShowReservationDialog(true);
      return;
    }

    if (table.status === "free") {
      navigate(`/billing?tableId=${table.id}&tableNumber=${table.tableNumber}&floorName=${encodeURIComponent(floorName)}&type=dine-in`);
    } else if (table.currentOrderId) {
      navigate(`/billing?tableId=${table.id}&tableNumber=${table.tableNumber}&floorName=${encodeURIComponent(floorName)}&orderId=${table.currentOrderId}&type=dine-in`);
    } else {
      // For occupied/preparing/ready/served tables without a currentOrderId,
      // this can happen with digital menu orders - navigate to billing to view/manage
      navigate(`/billing?tableId=${table.id}&tableNumber=${table.tableNumber}&floorName=${encodeURIComponent(floorName)}&type=dine-in`);
    }
  };

  const handleReservationClick = () => {
    setIsReservationMode(!isReservationMode);
    setSelectedTableForReservation(null);
  };

  const handleToggleServed = async (tableId: string) => {
    await markServedMutation.mutateAsync(tableId);
  };

  const handleViewOrder = async (tableId: string) => {
    const table = tablesWithOrders.find((t) => t.id === tableId);
    if (!table) return;
    
    setSelectedTable(table);
    
    if (table.currentOrderId) {
      try {
        const response = await fetch(`/api/orders/${table.currentOrderId}/items`);
        const items = await response.json();
        setOrderDetails(items);
      } catch (error) {
        setOrderDetails([]);
      }
    } else {
      setOrderDetails([]);
    }
    
    setShowOrderDialog(true);
  };

  const handleBilling = (tableId: string) => {
    const table = tablesWithOrders.find((t) => t.id === tableId);
    if (!table) return;
    
    const floor = floors.find((f) => f.id === table.floorId);
    const floorName = floor?.name || "";
    
    if (table.status === "free") {
      navigate(`/billing?tableId=${table.id}&tableNumber=${table.tableNumber}&floorName=${encodeURIComponent(floorName)}&type=dine-in`);
    } else if (table.currentOrderId) {
      navigate(`/billing?tableId=${table.id}&tableNumber=${table.tableNumber}&floorName=${encodeURIComponent(floorName)}&orderId=${table.currentOrderId}&type=dine-in`);
    }
  };

  const handleAddFloor = () => {
    if (!floorName.trim()) {
      toast({ title: "Floor name required", variant: "destructive" });
      return;
    }
    createFloorMutation.mutate({ name: floorName, displayOrder: floors.length });
  };

  const handleAddTable = () => {
    if (!tableNumber.trim()) {
      toast({ title: "Table number required", variant: "destructive" });
      return;
    }
    const floorId = selectedFloorId || (floors.length > 0 ? floors[0].id : null);
    createTableMutation.mutate({
      tableNumber,
      seats: parseInt(tableSeats) || 4,
      floorId,
    });
  };

  const tablesByFloor = floors.map((floor) => ({
    floor,
    tables: tablesWithOrders.filter((t) => t.floorId === floor.id),
  }));

  const statusCounts = {
    free: tablesWithOrders.filter((t) => t.status === "free").length,
    occupied: tablesWithOrders.filter((t) => t.status === "occupied").length,
    preparing: tablesWithOrders.filter((t) => t.status === "preparing").length,
    ready: tablesWithOrders.filter((t) => t.status === "ready").length,
    reserved: tablesWithOrders.filter((t) => t.status === "reserved").length,
    served: tablesWithOrders.filter((t) => t.status === "served").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "free": return "bg-white border border-black";
      case "occupied": return "bg-[#ff2400]";
      case "preparing": return "bg-[#fff500]";
      case "ready": return "bg-[#3acd32]";
      case "served": return "bg-[#8000ff]";
      case "reserved": return "bg-[#0075ff]";
      default: return "bg-white border border-black";
    }
  };

  const getTableStatus = (table: Table): "free" | "occupied" | "preparing" | "ready" | "reserved" | "served" => {
    return table.status as "free" | "occupied" | "preparing" | "ready" | "reserved" | "served";
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <AppHeader 
        title="Table Management" 
        showSearch={false} 
        onReservationClick={handleReservationClick}
        isReservationMode={isReservationMode}
      />

      <div className="p-6 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-4 flex-wrap hidden md:flex">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-white border-2 border-black shadow-sm"></div>
              <span className="text-sm font-medium">
                Available <Badge variant="secondary">{statusCounts.free}</Badge>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff2400]"></div>
              <span className="text-sm">
                Occupied <Badge variant="secondary">{statusCounts.occupied}</Badge>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#fff500]"></div>
              <span className="text-sm">
                Preparing <Badge variant="secondary">{statusCounts.preparing}</Badge>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#3acd32]"></div>
              <span className="text-sm">
                Ready <Badge variant="secondary">{statusCounts.ready}</Badge>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#0075ff]"></div>
              <span className="text-sm">
                Reserved <Badge variant="secondary">{statusCounts.reserved}</Badge>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8000ff]"></div>
              <span className="text-sm">
                Served <Badge variant="secondary">{statusCounts.served}</Badge>
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden" data-testid="button-table-status-menu">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Table Status</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-white border-2 border-black shadow-sm"></div>
                  <span>Available</span>
                </div>
                <Badge variant="secondary">{statusCounts.free}</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff2400]"></div>
                  <span>Occupied</span>
                </div>
                <Badge variant="secondary">{statusCounts.occupied}</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#fff500]"></div>
                  <span>Preparing</span>
                </div>
                <Badge variant="secondary">{statusCounts.preparing}</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#3acd32]"></div>
                  <span>Ready</span>
                </div>
                <Badge variant="secondary">{statusCounts.ready}</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#0075ff]"></div>
                  <span>Reserved</span>
                </div>
                <Badge variant="secondary">{statusCounts.reserved}</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#8000ff]"></div>
                  <span>Served</span>
                </div>
                <Badge variant="secondary">{statusCounts.served}</Badge>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => navigate("/billing?type=delivery")}
              data-testid="button-delivery-order"
            >
              <Plus className="h-4 w-4 mr-2" />
              Delivery Order
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => navigate("/table-management")}
                  data-testid="menu-add-floor"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Floor
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => navigate("/table-management")}
                  data-testid="menu-add-table"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Table
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => navigate("/table-management")}
                  data-testid="menu-edit"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Floor/Table
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading tables...</div>
        ) : (
          <div className="space-y-8">
            {tablesByFloor.map(({ floor, tables: floorTables }) => (
              <div key={floor.id}>
                <h2 className="text-xl font-bold mb-4">{floor.name}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                  {floorTables.map((table) => (
                    <TableCard
                      key={table.id}
                      id={table.id}
                      tableNumber={table.tableNumber}
                      status={getTableStatus(table)}
                      seats={table.seats}
                      orderStartTime={table.orderStartTime}
                      onClick={handleTableClick}
                      onToggleServed={handleToggleServed}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Order Details - Table {selectedTable?.tableNumber}</DialogTitle>
            <DialogDescription>
              {selectedTable?.status === "free" 
                ? "No active order" 
                : `Current order status: ${selectedTable?.status}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {orderDetails.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-lg font-medium">Empty</p>
                <p className="text-sm mt-1">No items in this order</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orderDetails.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex justify-between items-center p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty: {item.quantity} × ₹{parseFloat(item.price).toFixed(2)}
                      </p>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Note: {item.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        ₹{(item.quantity * parseFloat(item.price)).toFixed(2)}
                      </p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.status === 'new' ? 'bg-red-100 text-red-700' :
                        item.status === 'preparing' ? 'bg-yellow-100 text-yellow-700' :
                        item.status === 'ready' ? 'bg-green-100 text-green-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span>Total:</span>
                    <span className="text-primary">
                      ₹{orderDetails.reduce((sum, item) => 
                        sum + (item.quantity * parseFloat(item.price)), 0
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddFloorDialog} onOpenChange={setShowAddFloorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Floor</DialogTitle>
            <DialogDescription>Create a new floor to organize your tables</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="floor-name">Floor Name</Label>
              <Input
                id="floor-name"
                placeholder="e.g., Ground Floor, First Floor"
                value={floorName}
                onChange={(e) => setFloorName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddFloorDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleAddFloor} className="flex-1">
                Add Floor
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTableDialog} onOpenChange={setShowAddTableDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Table</DialogTitle>
            <DialogDescription>Create a new table</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="table-number">Table Number</Label>
              <Input
                id="table-number"
                placeholder="e.g., T1, T2"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="table-seats">Number of Seats</Label>
              <Input
                id="table-seats"
                type="number"
                min="1"
                placeholder="4"
                value={tableSeats}
                onChange={(e) => setTableSeats(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="table-floor">Floor</Label>
              <Select value={selectedFloorId} onValueChange={setSelectedFloorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select floor" />
                </SelectTrigger>
                <SelectContent>
                  {floors.map((floor) => (
                    <SelectItem key={floor.id} value={floor.id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddTableDialog(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleAddTable} className="flex-1">
                Add Table
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editMode === "floors" ? "Floors" : "Tables"}</DialogTitle>
            <DialogDescription>
              {editMode === "floors" ? "Manage your floors" : "Manage your tables"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {editMode === "floors" ? (
              floors.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No floors available</p>
              ) : (
                floors.map((floor) => (
                  <div key={floor.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="font-medium">{floor.name}</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteFloorMutation.mutate(floor.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )
            ) : (
              tablesWithOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No tables available</p>
              ) : (
                tablesWithOrders.map((table) => (
                  <div key={table.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <span className="font-medium">{table.tableNumber}</span>
                      <span className="text-sm text-muted-foreground ml-2">({table.seats} seats)</span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteTableMutation.mutate(table.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEditMode(editMode === "floors" ? "tables" : "floors")}
              className="flex-1"
            >
              Switch to {editMode === "floors" ? "Tables" : "Floors"}
            </Button>
            <Button onClick={() => setShowEditDialog(false)} className="flex-1">
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReservationDialog 
        open={showReservationDialog}
        onOpenChange={(open) => {
          setShowReservationDialog(open);
          if (!open) {
            setSelectedTableForReservation(null);
            setIsReservationMode(false);
          }
        }}
        selectedTableId={selectedTableForReservation}
        onReservationComplete={() => {
          setIsReservationMode(false);
        }}
      />
    </div>
  );
}
