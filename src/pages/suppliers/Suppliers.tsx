import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Truck, Trash2, Pencil, Mail, Phone, MapPin, Search, CheckCircle2, XCircle } from "lucide-react";
import SupplierForm, { type Supplier } from "./SupplierForm";

export default function Suppliers() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    document.title = "Suppliers · Apex Software";
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      setItems((data as any[]) ?? []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(payload: any) {
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    const { error } = editingSupplier
      ? await supabase.from("suppliers").update(payload).eq("id", editingSupplier.id!)
      : await supabase.from("suppliers").insert(payload);

    if (error) throw error;
    toast.success(editingSupplier ? "Supplier updated successfully" : "Supplier created successfully");
    load();
  }

  async function toggleActiveStatus(supplier: Supplier, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    try {
      const nextActive = !supplier.is_active;
      const { error } = await supabase
        .from("suppliers")
        .update({ is_active: nextActive })
        .eq("id", supplier.id!);
      if (error) throw error;
      toast.success(`Supplier ${nextActive ? "activated" : "deactivated"}`);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  }

  async function remove(supplier: Supplier, e: React.MouseEvent) {
    e.stopPropagation();
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", supplier.id!);
      if (error) {
        if ((error as any).code === "23503") {
          toast.error("This supplier has linked products or delivery challans and cannot be deleted. Deactivate instead.");
        } else {
          throw error;
        }
      } else {
        toast.success(`Deleted supplier: ${supplier.name}`);
        load();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete supplier");
    }
  }

  const filteredItems = items.filter((item) => {
    if (statusFilter === "active" && !item.is_active) return false;
    if (statusFilter === "inactive" && item.is_active) return false;
    const query = search.toLowerCase();
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      (item.supplier_code && item.supplier_code.toLowerCase().includes(query)) ||
      (item.contact && item.contact.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground mt-1">
            {items.length} registered · {items.filter((i) => i.is_active).length} active
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingSupplier(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />New Supplier
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center max-w-md w-full relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3" />
          <Input
            placeholder="Search by name, code, or contact..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="p-5 h-44 animate-pulse bg-secondary/10" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((s) => (
            <Card
              key={s.id}
              className="p-5 border border-border/50 bg-card hover:shadow-glow transition-all duration-300 cursor-pointer"
              onClick={() => navigate(`/suppliers/${s.id}`)}
            >
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-lg grid place-items-center ${s.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Truck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate text-foreground">{s.name}</p>
                    <Badge variant={s.is_active ? "default" : "secondary"} className="text-[10px] scale-90 px-1.5 h-4">
                      {s.supplier_code ?? "No Code"}
                    </Badge>
                  </div>
                  {s.contact && (
                    <p className="text-xs text-muted-foreground">
                      Contact: <span className="text-foreground">{s.contact}</span>
                    </p>
                  )}
                  {s.email && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground/75" />
                      {s.email}
                    </p>
                  )}
                  {s.phone && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/75" />
                      {s.phone}
                    </p>
                  )}
                  {s.address && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5 mt-1 line-clamp-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground/75 shrink-0 mt-0.5" />
                      {s.address}
                    </p>
                  )}
                  {s.gst_number && (
                    <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
                      GST: {s.gst_number}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setEditingSupplier(s); setFormOpen(true); }}
                      className="hover:bg-secondary"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => toggleActiveStatus(s, e)}
                      className={`hover:bg-secondary ${s.is_active ? "text-success hover:text-success" : "text-muted-foreground"}`}
                      title={s.is_active ? "Deactivate Supplier" : "Activate Supplier"}
                    >
                      {s.is_active ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => e.stopPropagation()}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {s.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes the supplier profile. Products or delivery challans linked to this supplier will fail to lazy-load the master profile if deletion is blocked — deactivate instead if this supplier is in use.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={(e) => remove(s, e)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </Card>
          ))}
          {filteredItems.length === 0 && (
            <Card className="p-12 col-span-full text-center text-muted-foreground">
              No suppliers found.
            </Card>
          )}
        </div>
      )}

      <SupplierForm
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={editingSupplier}
        onSave={handleSave}
      />
    </div>
  );
}
