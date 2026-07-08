import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, ArrowLeft, Check, X, Building2, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Floor, Table } from "@shared/schema";

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * apiRequest throws Error with message like "409: {"error":"A floor..."}"
 * This helper extracts the human-readable part.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as any).message as string;
    // Strip leading HTTP status code "NNN: " prefix then try JSON parse
    const jsonPart = msg.replace(/^\d{3}:\s*/, "");
    try {
      const parsed = JSON.parse(jsonPart);
      if (parsed?.error) return parsed.error;
    } catch {}
    return jsonPart || msg;
  }
  return "An error occurred";
}

// ─── Floor row ───────────────────────────────────────────────────────────────

function FloorRow({
  floor,
  tableCount,
  allFloors,
  onDelete,
}: {
  floor: Floor;
  tableCount: number;
  allFloors: Floor[];
  onDelete: (id: string, name: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(floor.name);

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      const res = await apiRequest("PATCH", `/api/floors/${floor.id}`, { name: newName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      setEditing(false);
      toast({ title: "Floor updated" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: "Floor name cannot be empty", variant: "destructive" });
      return;
    }
    if (trimmed.toLowerCase() === floor.name.toLowerCase()) {
      setEditing(false);
      return;
    }
    const duplicate = allFloors.find(
      f => f.id !== floor.id && f.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      toast({ title: "A floor with this name already exists", variant: "destructive" });
      return;
    }
    updateMutation.mutate(trimmed);
  };

  const handleCancel = () => {
    setName(floor.name);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-white hover:bg-muted/30 transition-colors">
      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />

      {editing ? (
        <>
          <Input
            className="flex-1 h-8"
            value={name}
            autoFocus
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={handleSave}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={handleCancel}>
            <X className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 font-medium">{floor.name}</span>
          <Badge variant="secondary" className="text-xs">{tableCount} table{tableCount !== 1 ? "s" : ""}</Badge>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(floor.id, floor.name)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Table row ───────────────────────────────────────────────────────────────

function TableRow({
  table,
  floors,
  allTables,
  onDelete,
}: {
  table: Table;
  floors: Floor[];
  allTables: Table[];
  onDelete: (id: string, name: string) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [tableNumber, setTableNumber] = useState(table.tableNumber);
  const [seats, setSeats] = useState(String(table.seats));
  const [floorId, setFloorId] = useState(table.floorId ?? "");

  const floorName = floors.find(f => f.id === table.floorId)?.name ?? "—";

  const updateMutation = useMutation({
    mutationFn: async (data: { tableNumber: string; seats: number; floorId: string | null }) => {
      const res = await apiRequest("PATCH", `/api/tables/${table.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setEditing(false);
      toast({ title: "Table updated" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  const handleSave = () => {
    const trimmedNum = tableNumber.trim();
    if (!trimmedNum) {
      toast({ title: "Table name cannot be empty", variant: "destructive" });
      return;
    }
    const seatsNum = parseInt(seats) || 1;
    const targetFloorId = floorId || null;

    // Client-side duplicate check
    const duplicate = allTables.find(
      t => t.id !== table.id &&
           t.floorId === targetFloorId &&
           t.tableNumber.trim().toLowerCase() === trimmedNum.toLowerCase()
    );
    if (duplicate) {
      toast({ title: "A table with this name already exists on this floor", variant: "destructive" });
      return;
    }

    updateMutation.mutate({ tableNumber: trimmedNum, seats: seatsNum, floorId: targetFloorId });
  };

  const handleCancel = () => {
    setTableNumber(table.tableNumber);
    setSeats(String(table.seats));
    setFloorId(table.floorId ?? "");
    setEditing(false);
  };

  return (
    <div className="p-3 border rounded-lg bg-white hover:bg-muted/30 transition-colors">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Table Name</Label>
              <Input
                className="h-8"
                value={tableNumber}
                autoFocus
                onChange={e => setTableNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Seats</Label>
              <Input
                className="h-8"
                type="number"
                min="1"
                value={seats}
                onChange={e => setSeats(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Floor</Label>
            <Select value={floorId} onValueChange={setFloorId}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select floor" />
              </SelectTrigger>
              <SelectContent>
                {floors.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <LayoutGrid className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">{table.tableNumber}</span>
            <span className="text-sm text-muted-foreground ml-2">· {floorName}</span>
          </div>
          <Badge variant="outline" className="text-xs">{table.seats} seat{table.seats !== 1 ? "s" : ""}</Badge>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(table.id, table.tableNumber)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TableManagementPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Add-floor form state
  const [newFloorName, setNewFloorName] = useState("");

  // Add-table form state
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("4");
  const [newTableFloorId, setNewTableFloorId] = useState("");

  // Floor filter for table tab
  const [filterFloorId, setFilterFloorId] = useState<string>("all");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ type: "floor" | "table"; id: string; name: string } | null>(null);

  const { data: floors = [] } = useQuery<Floor[]>({ queryKey: ["/api/floors"] });
  const { data: tables = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createFloorMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/floors", { name, displayOrder: floors.length });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      setNewFloorName("");
      toast({ title: "Floor created" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteFloorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/floors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/floors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      toast({ title: "Floor deleted" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  const createTableMutation = useMutation({
    mutationFn: async (data: { tableNumber: string; seats: number; floorId: string | null }) => {
      const res = await apiRequest("POST", "/api/tables", { ...data, status: "free" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      setNewTableNumber("");
      setNewTableSeats("4");
      toast({ title: "Table created" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
      toast({ title: "Table deleted" });
    },
    onError: (err) => {
      toast({ title: extractErrorMessage(err), variant: "destructive" });
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddFloor = () => {
    const trimmed = newFloorName.trim();
    if (!trimmed) {
      toast({ title: "Floor name is required", variant: "destructive" });
      return;
    }
    const duplicate = floors.find(f => f.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      toast({ title: "A floor with this name already exists", variant: "destructive" });
      return;
    }
    createFloorMutation.mutate(trimmed);
  };

  const handleAddTable = () => {
    const trimmed = newTableNumber.trim();
    if (!trimmed) {
      toast({ title: "Table name is required", variant: "destructive" });
      return;
    }
    const floorId = newTableFloorId || (floors.length > 0 ? floors[0].id : null);
    if (!floorId) {
      toast({ title: "Please create a floor first", variant: "destructive" });
      return;
    }
    const duplicate = tables.find(
      t => t.floorId === floorId && t.tableNumber.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      toast({ title: "A table with this name already exists on this floor", variant: "destructive" });
      return;
    }
    createTableMutation.mutate({ tableNumber: trimmed, seats: parseInt(newTableSeats) || 4, floorId });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "floor") {
      deleteFloorMutation.mutate(deleteTarget.id);
    } else {
      deleteTableMutation.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const filteredTables =
    filterFloorId === "all" ? tables : tables.filter(t => t.floorId === filterFloorId);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/tables")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold leading-tight">Floor & Table Management</h1>
          <p className="text-xs text-muted-foreground">
            {floors.length} floor{floors.length !== 1 ? "s" : ""} · {tables.length} table{tables.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Tabs defaultValue="floors" className="w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="floors" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Floors
              <Badge variant="secondary" className="ml-1 text-xs">{floors.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="tables" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Tables
              <Badge variant="secondary" className="ml-1 text-xs">{tables.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* ── FLOORS TAB ── */}
          <TabsContent value="floors" className="space-y-4">
            {/* Add floor card */}
            <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Plus className="h-4 w-4" /> Add New Floor
              </h3>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Ground Floor, Rooftop"
                  value={newFloorName}
                  onChange={e => setNewFloorName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddFloor()}
                  className="flex-1"
                />
                <Button onClick={handleAddFloor} disabled={createFloorMutation.isPending}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </div>

            {/* Floor list */}
            <div className="space-y-2">
              {floors.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Building2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No floors yet. Add one above.</p>
                </div>
              ) : (
                floors.map(floor => (
                  <FloorRow
                    key={floor.id}
                    floor={floor}
                    allFloors={floors}
                    tableCount={tables.filter(t => t.floorId === floor.id).length}
                    onDelete={(id, name) => setDeleteTarget({ type: "floor", id, name })}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* ── TABLES TAB ── */}
          <TabsContent value="tables" className="space-y-4">
            {/* Add table card */}
            <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Plus className="h-4 w-4" /> Add New Table
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Table Name *</Label>
                  <Input
                    placeholder="e.g., T1, T2, VIP-1"
                    value={newTableNumber}
                    onChange={e => setNewTableNumber(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddTable()}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Seats</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newTableSeats}
                    onChange={e => setNewTableSeats(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Floor *</Label>
                <Select
                  value={newTableFloorId || (floors[0]?.id ?? "")}
                  onValueChange={setNewTableFloorId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={floors.length === 0 ? "No floors available" : "Select floor"} />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddTable}
                disabled={createTableMutation.isPending || floors.length === 0}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Table
              </Button>
            </div>

            {/* Floor filter */}
            {floors.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={filterFloorId === "all" ? "default" : "outline"}
                  onClick={() => setFilterFloorId("all")}
                >
                  All ({tables.length})
                </Button>
                {floors.map(f => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={filterFloorId === f.id ? "default" : "outline"}
                    onClick={() => setFilterFloorId(f.id)}
                  >
                    {f.name} ({tables.filter(t => t.floorId === f.id).length})
                  </Button>
                ))}
              </div>
            )}

            {/* Table list */}
            <div className="space-y-2">
              {filteredTables.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <LayoutGrid className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No tables yet. Add one above.</p>
                </div>
              ) : (
                filteredTables.map(table => (
                  <TableRow
                    key={table.id}
                    table={table}
                    floors={floors}
                    allTables={tables}
                    onDelete={(id, name) => setDeleteTarget({ type: "table", id, name })}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.type === "floor" ? "Floor" : "Table"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "floor"
                ? `Are you sure you want to delete "${deleteTarget.name}"? All tables on this floor must be moved or deleted first.`
                : `Are you sure you want to delete table "${deleteTarget?.name}"? This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
