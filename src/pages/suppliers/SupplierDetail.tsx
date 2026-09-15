import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Truck, Pencil, Mail, Phone, MapPin, CheckCircle2, XCircle,
  FileText, Eye, Printer, CalendarDays,
} from "lucide-react";
import SupplierForm, { type Supplier } from "./SupplierForm";

type SupplierDC = {
  id: string;
  challan_number: string;
  challan_date: string;
  status: string;
  created_at: string;
};

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [dcs, setDcs] = useState<SupplierDC[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    document.title = "Supplier · Apex Software";
    if (id) load(id);
  }, [id]);

  async function load(supplierId: string) {
    try {
      setLoading(true);
      const { data: supplierData, error: supplierError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (supplierError) throw supplierError;
      setSupplier(supplierData as any);

      const { data: dcData, error: dcError } = await supabase
        .from("delivery_challans" as any)
        .select("id, challan_number, challan_date, status, created_at")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false });
      if (dcError) throw dcError;
      setDcs((dcData as any[]) ?? []);

      const dcIds = ((dcData as any[]) ?? []).map((d) => d.id);
      if (dcIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("delivery_challan_items" as any)
          .select("challan_id")
          .in("challan_id", dcIds);
        const counts: Record<string, number> = {};
        ((itemsData as any[]) ?? []).forEach((item) => {
          counts[item.challan_id] = (counts[item.challan_id] ?? 0) + 1;
        });
        setItemCounts(counts);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load supplier");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(payload: any) {
    if (!isAdmin || !supplier?.id) {
      toast.error("Admins only");
      return;
    }
    const { error } = await supabase.from("suppliers").update(payload).eq("id", supplier.id);
    if (error) throw error;
    toast.success("Supplier updated successfully");
    load(supplier.id);
  }

  async function toggleActiveStatus() {
    if (!isAdmin || !supplier?.id) {
      toast.error("Admins only");
      return;
    }
    try {
      const nextActive = !supplier.is_active;
      const { error } = await supabase.from("suppliers").update({ is_active: nextActive }).eq("id", supplier.id);
      if (error) throw error;
      toast.success(`Supplier ${nextActive ? "activated" : "deactivated"}`);
      load(supplier.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!supplier) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        Supplier not found.
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate("/suppliers")}>Back to Suppliers</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" onClick={() => navigate("/suppliers")} className="pl-0">
        <ArrowLeft className="h-4 w-4 mr-2" />Back to Suppliers
      </Button>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className={`h-14 w-14 rounded-xl grid place-items-center shrink-0 ${supplier.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Truck className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight truncate">{supplier.name}</h1>
              <Badge variant={supplier.is_active ? "default" : "secondary"}>
                {supplier.supplier_code ?? "No Code"}
              </Badge>
              <Badge variant={supplier.is_active ? "outline" : "destructive"}>
                {supplier.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {supplier.created_at && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                Added {new Date(supplier.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </Button>
              <Button variant="outline" size="sm" onClick={toggleActiveStatus}>
                {supplier.is_active ? <XCircle className="h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {supplier.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {supplier.contact && (
            <div>
              <p className="text-xs text-muted-foreground uppercase">Contact Person</p>
              <p className="font-medium">{supplier.contact}</p>
            </div>
          )}
          {supplier.email && (
            <div>
              <p className="text-xs text-muted-foreground uppercase">Email</p>
              <p className="font-medium flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{supplier.email}</p>
            </div>
          )}
          {supplier.phone && (
            <div>
              <p className="text-xs text-muted-foreground uppercase">Phone</p>
              <p className="font-medium flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{supplier.phone}</p>
            </div>
          )}
          {supplier.gst_number && (
            <div>
              <p className="text-xs text-muted-foreground uppercase">GST Number</p>
              <p className="font-medium font-mono">{supplier.gst_number}</p>
            </div>
          )}
          {supplier.address && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase">Address</p>
              <p className="font-medium flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />{supplier.address}</p>
            </div>
          )}
          {supplier.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase">Notes</p>
              <p className="text-sm whitespace-pre-line">{supplier.notes}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />Delivery Challans
          </h2>
          <Badge variant="secondary">{dcs.length}</Badge>
        </div>

        {dcs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No delivery challans for this supplier yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase border-b">
                  <th className="py-2 pr-3">DC No</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Items</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dcs.map((dc) => (
                  <tr key={dc.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 font-medium">{dc.challan_number}</td>
                    <td className="py-2 pr-3">{new Date(dc.challan_date).toLocaleDateString()}</td>
                    <td className="py-2 pr-3">{itemCounts[dc.id] ?? 0}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={dc.status === "draft" ? "secondary" : "default"} className="capitalize">{dc.status}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/dc?open=${dc.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/dc?open=${dc.id}&edit=1`)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/dc?open=${dc.id}&print=1`)}>
                          <Printer className="h-3.5 w-3.5 mr-1" />Print
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SupplierForm open={formOpen} onOpenChange={setFormOpen} supplier={supplier} onSave={handleSave} />
    </div>
  );
}
