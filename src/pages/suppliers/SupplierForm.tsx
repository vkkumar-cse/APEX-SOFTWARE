import { useEffect, useState } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const schema = z.object({
  supplier_code: z.string().trim().max(50).optional(),
  name: z.string().trim().min(1, "Supplier Name is required").max(150),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  contact: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  gst_number: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(1000).optional(),
  is_active: z.boolean(),
});

export type Supplier = {
  id?: string;
  supplier_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  contact: string | null;
  address: string | null;
  gst_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
};

interface SupplierFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  onSave: (payload: any) => Promise<void>;
}

const emptyForm = {
  supplier_code: "",
  name: "",
  email: "",
  phone: "",
  contact: "",
  address: "",
  gst_number: "",
  notes: "",
  is_active: true,
};

export default function SupplierForm({ open, onOpenChange, supplier, onSave }: SupplierFormProps) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (supplier) {
      setForm({
        supplier_code: supplier.supplier_code ?? "",
        name: supplier.name ?? "",
        email: supplier.email ?? "",
        phone: supplier.phone ?? "",
        contact: supplier.contact ?? "",
        address: supplier.address ?? "",
        gst_number: supplier.gst_number ?? "",
        notes: supplier.notes ?? "",
        is_active: supplier.is_active ?? true,
      });
    } else {
      setForm(emptyForm);
    }
  }, [supplier, open]);

  async function handleSave() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    try {
      setSaving(true);
      await onSave({
        ...parsed.data,
        supplier_code: parsed.data.supplier_code || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        contact: parsed.data.contact || null,
        address: parsed.data.address || null,
        gst_number: parsed.data.gst_number || null,
        notes: parsed.data.notes || null,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? `Edit Supplier: ${supplier.name}` : "Add New Supplier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier_code">Supplier Code / ID</Label>
              <Input
                id="supplier_code"
                placeholder="e.g. SUP001"
                value={form.supplier_code}
                onChange={(e) => setForm({ ...form, supplier_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Supplier Name</Label>
              <Input
                id="name"
                placeholder="Acme Vendors Pvt Ltd"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="orders@vendor.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                placeholder="+91 ..."
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact">Contact Person</Label>
              <Input
                id="contact"
                placeholder="John Doe"
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst_number">GST Number</Label>
              <Input
                id="gst_number"
                placeholder="27AAAAA1111A1Z1"
                value={form.gst_number}
                onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="Full supplier address"
              rows={3}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes about this supplier"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-secondary/20">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="text-sm font-semibold">Active Status</Label>
              <p className="text-xs text-muted-foreground">Inactive suppliers cannot be assigned to new transactions.</p>
            </div>
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Supplier"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
