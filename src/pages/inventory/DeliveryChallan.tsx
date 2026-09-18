import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchSelect } from "@/components/SearchSelect";
import { toast } from "sonner";
import { Plus, Trash2, Send, FileText, Printer, Pencil, X } from "lucide-react";

type Customer = {
  id: string;
  customer_code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  gst_number?: string;
};

type Supplier = {
  id: string;
  supplier_code: string | null;
  name: string;
  address: string | null;
  is_active: boolean;
  gst_number?: string | null;
  contact?: string | null;
};

type Product = {
  id: string;
  name: string;
  part_no: string | null;
  code: string | null;
  description: string | null;
};

type DcType = "customer" | "supplier";

type DeliveryChallan = {
  id: string;
  challan_number: string;
  type: DcType;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer_address_snapshot: string | null;
  supplier_id: string | null;
  supplier_name_snapshot: string | null;
  supplier_address_snapshot: string | null;
  challan_date: string;
  returnable: boolean;
  status: "draft" | "dispatched" | "cancelled";
  notes: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name?: string;
};

type DeliveryChallanItem = {
  id: string;
  challan_id: string;
  product_id: string | null;
  item_name?: string;
  item_code?: string;
  description?: string;
  quantity: number;
  uom: string;
  remarks: string | null;
  product?: Product;
};

const emptyLineItem = { product_id: "", item_name: "", item_code: "", description: "", quantity: "", uom: "pcs", remarks: "" };

export default function DeliveryChallan() {
  const { isAdmin, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dcList, setDcList] = useState<DeliveryChallan[]>([]);
  const [dcItems, setDcItems] = useState<Record<string, DeliveryChallanItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editDcOpen, setEditDcOpen] = useState(false);
  const [deleteDcOpen, setDeleteDcOpen] = useState(false);
  const [selectedDc, setSelectedDc] = useState<DeliveryChallan | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'dispatched' | 'cancelled'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | DcType>('all');

  const [newDcForm, setNewDcForm] = useState({
    type: "customer" as DcType,
    customer_id: "",
    supplier_id: "",
    returnable: false,
  });

  const [editDcForm, setEditDcForm] = useState({
    challan_date: "",
    returnable: false,
    customer_id: "",
    supplier_id: "",
    notes: "",
  });

  const [lineItemForm, setLineItemForm] = useState(emptyLineItem);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Delivery Challans · Apex Software";
    loadData();
  }, []);

  // Deep-link support: /dc?open=<id>&edit=1|print=1 (used by Supplier/Customer detail pages)
  useEffect(() => {
    if (deepLinkHandled || loading || dcList.length === 0) return;
    const openId = searchParams.get("open");
    if (openId) {
      const dc = dcList.find((d) => d.id === openId);
      if (dc) {
        setSelectedDc(dc);
        if (searchParams.get("edit") === "1") openEditDc(dc);
        if (searchParams.get("print") === "1") setShowPrint(true);
      }
    }
    setDeepLinkHandled(true);
  }, [dcList, loading, deepLinkHandled, searchParams]);

  async function loadData() {
    try {
      setLoading(true);
      const [dcRes, itemsRes, custRes, supRes, prodRes] = await Promise.all([
        supabase.from("delivery_challans" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("delivery_challan_items" as any).select("*").order("id", { ascending: true }),
        supabase.from("customers" as any).select("*").eq("is_active", true).order("name"),
        supabase.from("suppliers" as any).select("*").eq("is_active", true).order("name"),
        supabase.from("products" as any).select("id, name, part_no, code, description").order("name"),
      ]);

      if (dcRes.error) throw dcRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (custRes.error) throw custRes.error;
      if (supRes.error) throw supRes.error;
      if (prodRes.error) throw prodRes.error;

      const dcData = (dcRes.data as any) ?? [];
      // Fetch profiles separately
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles" as any)
        .select("id, display_name, email");
      if (profilesError) throw profilesError;

      let profilesMap: Record<string, string> = {};
      (profilesData as any[] ?? []).forEach((p) => {
        profilesMap[p.id] = p.display_name || p.email || "Unknown";
      });

      // Attach created_by_name for UI display
      dcData.forEach((dc: any) => {
        dc.created_by_name = dc.created_by ? profilesMap[dc.created_by] ?? 'Unknown' : 'Unknown';
        dc.type = dc.type ?? "customer";
      });
      setDcList(dcData);
      setCustomers((custRes.data as any) ?? []);
      setSuppliers((supRes.data as any) ?? []);
      setProducts((prodRes.data as any) ?? []);

      const itemsMap: Record<string, DeliveryChallanItem[]> = {};
      (itemsRes.data as any ?? []).forEach((item: any) => {
        const key = item.challan_id || item.delivery_challan_id;
        if (!itemsMap[key]) {
          itemsMap[key] = [];
        }
        itemsMap[key].push(item);
      });
      setDcItems(itemsMap);

      // Keep selectedDc in sync with any freshly loaded data (e.g. after an edit)
      setSelectedDc((prev) => (prev ? dcData.find((d: any) => d.id === prev.id) ?? prev : prev));
    } catch (err: any) {
      toast.error(err.message || "Failed to load delivery challans");
    } finally {
      setLoading(false);
    }
  }

  async function generateChallanNumber() {
    try {
      const { data, error } = await (supabase as any).rpc("next_dc_number");
      if (error) throw error;
      if (data) return data as string;
      throw new Error("No number returned");
    } catch (err) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      return `DC-${year}${month}${day}-${hours}${minutes}${seconds}`;
    }
  }

  async function handleCreateDc() {
    if (newDcForm.type === "customer" && !newDcForm.customer_id) {
      toast.error("Please select a customer");
      return;
    }
    if (newDcForm.type === "supplier" && !newDcForm.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }

    try {
      const challanNumber = await generateChallanNumber();
      const payload: any = {
        challan_number: challanNumber,
        challan_date: new Date().toISOString(),
        type: newDcForm.type,
        returnable: newDcForm.returnable,
        status: "draft",
        created_by: user?.id,
      };

      if (newDcForm.type === "customer") {
        const customer = customers.find((c) => c.id === newDcForm.customer_id);
        if (!customer) {
          toast.error("Customer not found");
          return;
        }
        payload.customer_id = customer.id;
        payload.customer_name_snapshot = customer.name;
        payload.customer_address_snapshot = customer.address;
      } else {
        const supplier = suppliers.find((s) => s.id === newDcForm.supplier_id);
        if (!supplier) {
          toast.error("Supplier not found");
          return;
        }
        payload.supplier_id = supplier.id;
        payload.supplier_name_snapshot = supplier.name;
        payload.supplier_address_snapshot = supplier.address;
      }

      const { data, error } = await supabase
        .from("delivery_challans" as any)
        .insert([payload])
        .select();

      if (error) throw error;

      toast.success("Delivery Challan created");
      setNewDcForm({ type: "customer", customer_id: "", supplier_id: "", returnable: false });
      setCreateOpen(false);
      setSelectedDc((data as any[])[0]);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create DC");
    }
  }

  function openEditDc(dc: DeliveryChallan) {
    setSelectedDc(dc);
    setEditDcForm({
      challan_date: dc.challan_date ? new Date(dc.challan_date).toISOString().slice(0, 10) : "",
      returnable: dc.returnable,
      customer_id: dc.customer_id ?? "",
      supplier_id: dc.supplier_id ?? "",
      notes: dc.notes ?? "",
    });
    setEditDcOpen(true);
  }

  async function handleUpdateDc() {
    if (!selectedDc) return;

    if (selectedDc.type === "customer" && !editDcForm.customer_id) {
      toast.error("Please select a customer");
      return;
    }
    if (selectedDc.type === "supplier" && !editDcForm.supplier_id) {
      toast.error("Please select a supplier");
      return;
    }

    try {
      const payload: any = {
        challan_date: editDcForm.challan_date || selectedDc.challan_date,
        returnable: editDcForm.returnable,
        notes: editDcForm.notes.trim() || null,
      };

      if (selectedDc.type === "customer") {
        const customer = customers.find((c) => c.id === editDcForm.customer_id);
        if (!customer) {
          toast.error("Customer not found");
          return;
        }
        payload.customer_id = customer.id;
        payload.customer_name_snapshot = customer.name;
        payload.customer_address_snapshot = customer.address;
      } else {
        const supplier = suppliers.find((s) => s.id === editDcForm.supplier_id);
        if (!supplier) {
          toast.error("Supplier not found");
          return;
        }
        payload.supplier_id = supplier.id;
        payload.supplier_name_snapshot = supplier.name;
        payload.supplier_address_snapshot = supplier.address;
      }

      const { error } = await supabase
        .from("delivery_challans" as any)
        .update(payload)
        .eq("id", selectedDc.id);

      if (error) throw error;

      toast.success("Delivery Challan updated");
      setEditDcOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update DC");
    }
  }

  function startEditItem(item: DeliveryChallanItem) {
    setEditingItemId(item.id);
    setLineItemForm({
      product_id: item.product_id ?? "",
      item_name: item.item_name ?? "",
      item_code: item.item_code ?? "",
      description: item.description ?? "",
      quantity: String(item.quantity ?? ""),
      uom: item.uom ?? "pcs",
      remarks: item.remarks ?? "",
    });
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setLineItemForm(emptyLineItem);
  }

  async function handleSaveLineItem() {
    if (!selectedDc) {
      toast.error("No DC selected");
      return;
    }

    if (!lineItemForm.quantity || (!lineItemForm.product_id && !lineItemForm.item_name.trim())) {
      toast.error("Item name and quantity are required");
      return;
    }

    try {
      const quantity = parseInt(lineItemForm.quantity, 10);
      if (quantity <= 0) {
        toast.error("Quantity must be greater than 0");
        return;
      }

      const payload: any = {
        product_id: lineItemForm.product_id || null,
        item_name: String(lineItemForm.item_name).trim(),
        item_code: String(lineItemForm.item_code).trim() || null,
        description: lineItemForm.description.trim() || null,
        quantity,
        uom: lineItemForm.uom,
        remarks: lineItemForm.remarks || null,
      };

      if (editingItemId) {
        const { error } = await supabase
          .from("delivery_challan_items" as any)
          .update(payload)
          .eq("id", editingItemId);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase
          .from("delivery_challan_items" as any)
          .insert([{ ...payload, challan_id: selectedDc.id }]);
        if (error) throw error;
        toast.success("Item added to DC");
      }

      cancelEditItem();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save item");
    }
  }

  async function handleRemoveLineItem(itemId: string) {
    try {
      const { error } = await supabase.from("delivery_challan_items" as any).delete().eq("id", itemId);
      if (error) throw error;
      if (editingItemId === itemId) cancelEditItem();
      toast.success("Item removed");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove item");
    }
  }

  async function handleMarkDispatched() {
    if (!selectedDc) {
      toast.error("No DC selected");
      return;
    }

    try {
      const { error } = await supabase
        .from("delivery_challans" as any)
        .update({ status: "dispatched" })
        .eq("id", selectedDc.id);

      if (error) throw error;

      toast.success("DC marked as dispatched");
      setSelectedDc(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update DC status");
    }
  }

  const handleDeleteDc = async (dcId: string) => {
    if (!isAdmin) {
      toast.error("Admins only");
      return;
    }
    try {
      // Fetch DC and its items before deletion for undo
      const { data: dcData } = await supabase
        .from("delivery_challans" as any)
        .select("*")
        .eq("id", dcId)
        .single();
      const { data: itemsData } = await supabase
        .from("delivery_challan_items" as any)
        .select("*")
        .eq("challan_id", dcId);
      // Delete items
      await supabase.from("delivery_challan_items" as any).delete().eq("challan_id", dcId);
      // Delete DC
      const { error } = await supabase.from("delivery_challans" as any).delete().eq("id", dcId);
      if (error) throw error;
      toast.success("DC deleted", {
        description: "", // optional
        action: {
          label: "Undo",
          onClick: async () => {
            if (!dcData) return;
            // Re-insert DC
            await supabase.from("delivery_challans" as any).insert([dcData]);
            // Re-insert items if any
            if (itemsData && itemsData.length > 0) {
              await supabase.from("delivery_challan_items" as any).insert(itemsData);
            }
            toast.success("DC restored");
            loadData();
          },
        },
      });
      setSelectedDc(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete DC");
    }
  };

  function openDcRow(dc: DeliveryChallan, mode?: "edit" | "print") {
    setSelectedDc(dc);
    if (mode === "edit") openEditDc(dc);
    if (mode === "print") setShowPrint(true);
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  // Apply filters to the full list
  const filteredList = dcList.filter((dc) => {
    if (statusFilter !== 'all' && dc.status !== statusFilter) return false;
    if (typeFilter !== 'all' && dc.type !== typeFilter) return false;
    const dcDate = new Date(dc.challan_date);
    if (fromDate && dcDate < new Date(fromDate)) return false;
    if (toDate && dcDate > new Date(toDate)) return false;
    if (customerSearch) {
      if (dc.type === "customer" && dc.customer_id !== customerSearch) return false;
      if (dc.type === "supplier" && dc.supplier_id !== customerSearch) return false;
    }
    return true;
  });
  const draftDcs = filteredList.filter((dc) => dc.status === "draft");
  const dispatchedDcs = filteredList.filter((dc) => dc.status === "dispatched");
  const cancelledDcs = filteredList.filter((dc) => dc.status === "cancelled");

  const partyPickerOptions =
    typeFilter === "supplier"
      ? suppliers.map((s) => ({ value: s.id, label: s.name }))
      : typeFilter === "customer"
        ? customers.map((c) => ({ value: c.id, label: c.name }))
        : [...customers.map((c) => ({ value: c.id, label: `${c.name} (Customer)` })), ...suppliers.map((s) => ({ value: s.id, label: `${s.name} (Supplier)` }))];

  return (
 <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  {/* Header with title and New DC button */}
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Delivery Challans</h1>
      <p className="text-muted-foreground mt-1">
        {draftDcs.length} draft · {dispatchedDcs.length} dispatched · {cancelledDcs.length} cancelled
      </p>
    </div>
    {isAdmin && (
    <Dialog open={createOpen} onOpenChange={(open) => {
      setCreateOpen(open);
      if (!open) {
        setNewDcForm({ type: "customer", customer_id: "", supplier_id: "", returnable: false });
      }
    }}>
      <DialogTrigger asChild>
        <Button className="no-print">
          <Plus className="h-4 w-4 mr-2" />
          New DC
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Create Delivery Challan</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Tabs
            value={newDcForm.type}
            onValueChange={(v) => setNewDcForm({ ...newDcForm, type: v as DcType, customer_id: "", supplier_id: "" })}
          >
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="customer">Customer DC</TabsTrigger>
              <TabsTrigger value="supplier">Supplier DC</TabsTrigger>
            </TabsList>
          </Tabs>
          {newDcForm.type === "customer" ? (
            <div className="space-y-2">
              <Label>Customer</Label>
              <SearchSelect
                placeholder="Select customer…"
                value={newDcForm.customer_id}
                onChange={(v) => setNewDcForm({ ...newDcForm, customer_id: v })}
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Supplier</Label>
              <SearchSelect
                placeholder="Select supplier…"
                value={newDcForm.supplier_id}
                onChange={(v) => setNewDcForm({ ...newDcForm, supplier_id: v })}
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          )}
          <div className="flex items-center gap-3 p-3 border border-border/50 rounded-lg bg-secondary/20">
            <div className="flex-1">
              <Label htmlFor="returnable" className="text-sm font-semibold">Returnable</Label>
              <p className="text-xs text-muted-foreground">Mark if items are returnable</p>
            </div>
            <input
              id="returnable"
              type="checkbox"
              checked={newDcForm.returnable}
              onChange={(e) => setNewDcForm({ ...newDcForm, returnable: e.target.checked })}
              className="h-5 w-5 cursor-pointer"
            />
          </div>
            <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="no-print">Cancel</Button>
            <Button onClick={handleCreateDc} className="no-print">Create DC</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    )}
  </div>
  {/* Filters row */}
  <div className="flex flex-wrap gap-4 items-center mb-4">
    {/* From / To Date */}
    <div className="flex items-center gap-2">
      <Label>From</Label>
      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border rounded p-1 text-black placeholder:text-gray-400" />
      <Label>To</Label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border rounded p-1 text-black placeholder:text-gray-400" />
    </div>
    <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }} className="ml-2 no-print">Clear Dates</Button>
    {/* Type Filter */}
    <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as any); setCustomerSearch(""); }}>
      <SelectTrigger className="w-[150px]">
        <SelectValue placeholder="All types" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All types</SelectItem>
        <SelectItem value="customer">Customer</SelectItem>
        <SelectItem value="supplier">Supplier</SelectItem>
      </SelectContent>
    </Select>
    {/* Customer/Supplier Search */}
    <SearchSelect
      placeholder="Search customer/supplier…"
      value={customerSearch}
      onChange={(v) => setCustomerSearch(v)}
      options={partyPickerOptions}
    />
    {/* Status Filter */}
    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
      <SelectTrigger className="w-[150px]">
        <SelectValue placeholder="All" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="dispatched">Dispatched</SelectItem>
        <SelectItem value="cancelled">Cancelled</SelectItem>
      </SelectContent>
    </Select>
    </div>

      {selectedDc ? (
        <div className="space-y-6">
          <Card className="p-6 border-primary/50">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedDc.challan_number}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(selectedDc.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="capitalize">{selectedDc.type}</Badge>
                <Badge variant={selectedDc.status === "draft" ? "secondary" : "default"}>
                  {selectedDc.status.toUpperCase()}
                </Badge>
                {selectedDc.returnable && <Badge variant="outline">Returnable</Badge>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-6 p-4 bg-secondary/40 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{selectedDc.type === "supplier" ? "Supplier" : "Customer"}</p>
                <p className="font-semibold">
                  {selectedDc.type === "supplier" ? selectedDc.supplier_name_snapshot : selectedDc.customer_name_snapshot}
                </p>
              </div>
              {(selectedDc.type === "supplier" ? selectedDc.supplier_address_snapshot : selectedDc.customer_address_snapshot) && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Address</p>
                  <p className="text-sm">
                    {selectedDc.type === "supplier" ? selectedDc.supplier_address_snapshot : selectedDc.customer_address_snapshot}
                  </p>
                </div>
              )}
              {selectedDc.notes && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground uppercase">Notes</p>
                  <p className="text-sm whitespace-pre-line">{selectedDc.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-4 p-4 bg-secondary/20 rounded-lg mb-6">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold">{editingItemId ? "Edit Item" : "Add Item"}</div>
                <p className="text-xs text-muted-foreground">Choose an inventory product or enter a manual item for one-off deliveries.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Inventory product</Label>
                  <SearchSelect
                    placeholder="Select product…"
                    value={lineItemForm.product_id}
                    onChange={(v) => {
                      const product = products.find((p) => p.id === v);
                      setLineItemForm({
                        ...lineItemForm,
                        product_id: v,
                        item_name: product?.name ?? "",
                        item_code: product?.part_no ?? product?.code ?? "",
                        description: product?.description ?? "",
                      });
                    }}
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name}${p.part_no ? ` (${p.part_no})` : ""}`,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Manual entry</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLineItemForm({
                        ...lineItemForm,
                        product_id: "",
                        item_name: "",
                        item_code: "",
                        description: "",
                      })}
                      className="no-print"
                    >
                      Clear product
                    </Button>
                    <span className="text-xs text-muted-foreground">Use this when the item is not in inventory.</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Item name</Label>
                  <Input
                    placeholder="Item name"
                    value={lineItemForm.item_name}
                    onChange={(e) => setLineItemForm({ ...lineItemForm, item_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Item code</Label>
                  <Input
                    placeholder="Item code"
                    value={lineItemForm.item_code}
                    onChange={(e) => setLineItemForm({ ...lineItemForm, item_code: String(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={lineItemForm.quantity}
                    onChange={(e) => setLineItemForm({ ...lineItemForm, quantity: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>UOM</Label>
                  <Select value={lineItemForm.uom} onValueChange={(v) => setLineItemForm({ ...lineItemForm, uom: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">Pieces</SelectItem>
                      <SelectItem value="kg">KG</SelectItem>
                      <SelectItem value="m">Meter</SelectItem>
                      <SelectItem value="litre">Litre</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Item description"
                    rows={2}
                    value={lineItemForm.description}
                    onChange={(e) => setLineItemForm({ ...lineItemForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  placeholder="Remarks"
                  rows={1}
                  value={lineItemForm.remarks}
                  onChange={(e) => setLineItemForm({ ...lineItemForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveLineItem} className="flex-1 no-print">
                  <Plus className="h-4 w-4 mr-2" />
                  {editingItemId ? "Update Item" : "Add Item"}
                </Button>
                {editingItemId && (
                  <Button variant="outline" onClick={cancelEditItem} className="no-print">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold">Items ({dcItems[selectedDc.id]?.length ?? 0})</div>
              {dcItems[selectedDc.id] && dcItems[selectedDc.id].length > 0 ? (
                dcItems[selectedDc.id].map((item) => {
                  const prod = products.find((p) => p.id === item.product_id);
                  const itemLabel = item.product_id ? prod?.name ?? "" : item.item_name ?? "";
                  const itemCode = item.item_code || prod?.part_no || prod?.code || "";
                  return (
                    <div key={item.id} className={`flex items-start justify-between gap-3 p-3 border rounded-lg bg-secondary/10 ${editingItemId === item.id ? "border-primary" : "border-border/50"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{itemLabel}</p>
                        {itemCode && <p className="text-xs text-muted-foreground">Code: {itemCode}</p>}
                        {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
                        <p className="text-sm mt-1">
                          {item.quantity} {item.uom}
                        </p>
                        {item.remarks && <p className="text-xs text-muted-foreground italic mt-1">{item.remarks}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="no-print"
                          onClick={() => startEditItem(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 no-print"
                          onClick={() => handleRemoveLineItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No items yet</p>
              )}
            </div>

            <div className="flex gap-2 mt-6 flex-wrap">
              <Button variant="outline" onClick={() => { setSelectedDc(null); cancelEditItem(); }} className="no-print">
                Back
              </Button>
              <Button
                variant="outline"
                onClick={() => openEditDc(selectedDc)}
                className="no-print"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit DC
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowPrint(true)}
                className="no-print"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              {selectedDc.status === "draft" && (
                <Button onClick={handleMarkDispatched} className="no-print">
                  <Send className="h-4 w-4 mr-2" />
                  Mark Dispatched
                </Button>
              )}
              {isAdmin && (
                <AlertDialog open={deleteDcOpen} onOpenChange={setDeleteDcOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="no-print">Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this delivery challan?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. All line items will be removed with the challan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="no-print">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 no-print"
                        onClick={() => {
                          if (selectedDc) {
                            handleDeleteDc(selectedDc.id);
                            setDeleteDcOpen(false);
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Table view of filtered DCs */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 font-bold text-black">DC No</th>
                  <th className="border p-2 font-bold text-black">Date</th>
                  <th className="border p-2 font-bold text-black">Customer/Supplier</th>
                  <th className="border p-2 font-bold text-black">Items</th>
                  <th className="border p-2 font-bold text-black">Status</th>
                  <th className="border p-2 font-bold text-black">Created By</th>
                  <th className="border p-2 font-bold text-black">Created At</th>
                  <th className="border p-2 font-bold text-black">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((dc) => (
                  <tr key={dc.id} className="cursor-pointer hover:bg-secondary/20" onClick={() => setSelectedDc(dc)}>
                    <td className="border p-2 text-center">{dc.challan_number ?? dc.id.slice(0, 8).toUpperCase()}</td>
                    <td className="border p-2 text-center">{new Date(dc.challan_date).toLocaleDateString()}</td>
                    <td className="border p-2">{dc.type === "supplier" ? dc.supplier_name_snapshot : dc.customer_name_snapshot}</td>
                    <td className="border p-2 text-center">{dcItems[dc.id]?.length ?? 0}</td>
                    <td className="border p-2 text-center">{dc.status}</td>
                    <td className="border p-2">{(dc as any).created_by_name || ''}</td>
                    <td className="border p-2 text-center">{new Date(dc.created_at).toLocaleDateString()}</td>
                    <td className="border p-2 text-center whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openDcRow(dc); }} className="no-print">Open</Button>
                        <Button variant="outline" size="sm" className="ml-2 no-print" onClick={(e) => { e.stopPropagation(); openDcRow(dc, "edit"); }}>Edit</Button>
                        <Button variant="outline" size="sm" className="ml-2 no-print" onClick={(e) => { e.stopPropagation(); openDcRow(dc, "print"); }}>Print</Button>
                        {isAdmin && (
                          <Button variant="destructive" size="sm" className="ml-2 no-print" onClick={(e) => { e.stopPropagation(); setSelectedDc(dc); setDeleteDcOpen(true); }}>Delete</Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dcList.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">
              No delivery challans yet. Create one to get started.
            </Card>
          )}
        </div>
      )}

      {editDcOpen && selectedDc && (
        <Dialog open={editDcOpen} onOpenChange={setEditDcOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit {selectedDc.challan_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>DC Number</Label>
                <Input value={selectedDc.challan_number} disabled />
              </div>
              <div className="space-y-2">
                <Label>DC Date</Label>
                <Input
                  type="date"
                  value={editDcForm.challan_date}
                  onChange={(e) => setEditDcForm({ ...editDcForm, challan_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{selectedDc.type === "supplier" ? "Supplier" : "Customer"}</Label>
                {selectedDc.type === "supplier" ? (
                  <SearchSelect
                    placeholder="Select supplier…"
                    value={editDcForm.supplier_id}
                    onChange={(v) => setEditDcForm({ ...editDcForm, supplier_id: v })}
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  />
                ) : (
                  <SearchSelect
                    placeholder="Select customer…"
                    value={editDcForm.customer_id}
                    onChange={(v) => setEditDcForm({ ...editDcForm, customer_id: v })}
                    options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 p-3 border border-border/50 rounded-lg bg-secondary/20">
                <div className="flex-1">
                  <Label className="text-sm font-semibold">Returnable</Label>
                  <p className="text-xs text-muted-foreground">Mark if items are returnable</p>
                </div>
                <input
                  type="checkbox"
                  checked={editDcForm.returnable}
                  onChange={(e) => setEditDcForm({ ...editDcForm, returnable: e.target.checked })}
                  className="h-5 w-5 cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={editDcForm.notes}
                  onChange={(e) => setEditDcForm({ ...editDcForm, notes: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setEditDcOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateDc}>Save changes</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {showPrint && selectedDc && (
        <PrintPreview dc={selectedDc} items={dcItems[selectedDc.id] ?? []} products={products} customers={customers} suppliers={suppliers} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}

const ITEMS_PER_PAGE = 8;

function PrintPreview({
  dc,
  items,
  products,
  customers,
  suppliers,
  onClose,
}: {
  dc: DeliveryChallan;
  items: DeliveryChallanItem[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  onClose: () => void;
}) {
  const customer = customers.find((c) => c.id === dc.customer_id);
  const supplier = suppliers.find((s) => s.id === dc.supplier_id);
  const title = dc.returnable ? "Returnable Delivery Challan" : "Non-Returnable Delivery Challan";
  const printRef = useRef<HTMLDivElement>(null);
  const itemPages = chunkItems(items, ITEMS_PER_PAGE);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `DC-${dc.challan_number}`,
    pageStyle: `
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      body {
        margin: 0;
        padding: 0;
        background: white;
        color: black;
      }
    `,
  });

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] max-w-[95vw] p-0 border-none bg-white shadow-lg overflow-hidden flex flex-col"
        style={{ width: "min(900px, 95vw)", height: "90vh", maxHeight: "90vh", boxSizing: "border-box" }}
      >
        <style>{`
          .print-preview-scroll {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            background: #e5e7eb;
            padding: 16px;
            box-sizing: border-box;
          }

          .print-preview-document {
            width: 194mm;
            max-width: 100%;
            background: white;
            color: black;
            display: flex;
            flex-direction: column;
            gap: 16px;
            box-sizing: border-box;
            padding: 0;
            margin: 0 auto;
          }

          /* Each .dc-print-page is a fixed, self-contained A4 DC form: same
             header/title/party-info/table/signature structure on every page,
             sized to fit exactly one physical A4 sheet. Content is never
             allowed to grow the page — item rows are always padded/clipped to
             a fixed count so every page is visually identical in size. */
          .print-preview-document .dc-print-page {
            width: 100%;
            height: 281mm;
            background: white;
            color: black;
            display: flex;
            flex-direction: column;
            padding: 4mm;
            margin: 0;
            box-sizing: border-box;
            border: 1px solid #000;
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: hidden;
          }

          .print-preview-document .dc-print-page:not(:last-child) {
            page-break-after: always;
            break-after: page;
          }

          .print-preview-document .print-header {
            width: 100%;
            padding: 6mm 12mm 5mm;
            border-bottom: 1px solid #000;
            text-align: center;
            flex-shrink: 0;
            box-sizing: border-box;
            background: white;
            color: black;
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }

          .print-preview-document .print-company-name {
            margin: 0 0 3mm;
            font-size: 20pt;
            line-height: 1.12;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0;
          }

          .print-preview-document .print-company-address {
            margin: 0;
            font-size: 9pt;
            line-height: 1.3;
            text-align: center;
            max-width: 135mm;
          }

          .print-preview-document .print-company-gstin {
            margin: 3.5mm 0 0;
            font-size: 9.5pt;
            line-height: 1.25;
            font-weight: 700;
          }

          .print-preview-document .print-title {
            width: 100%;
            padding: 3.5mm 8mm;
            background-color: #f3f4f6;
            border-bottom: 1px solid #000;
            font-weight: bold;
            text-align: center;
            font-size: 11pt;
            text-transform: uppercase;
            flex-shrink: 0;
            box-sizing: border-box;
            margin: 0;
          }

          .print-preview-document .print-customer-section {
            width: 100%;
            display: grid;
            grid-template-columns: 60% 40%;
            border: 1px solid #000;
            border-top: 0;
            flex-shrink: 0;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          .print-preview-document .print-customer-block {
            width: 100%;
            padding: 4mm 8mm;
            border-right: 1px solid #000;
            font-size: 10pt;
            line-height: 1.4;
            background: white;
            color: black;
            box-sizing: border-box;
            margin: 0;
          }

          .print-preview-document .print-dc-info-block {
            width: 100%;
            padding: 4mm 8mm;
            font-size: 10pt;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            background: white;
            color: black;
            box-sizing: border-box;
            margin: 0;
          }

          .print-preview-document .print-table {
            width: 100%;
            border-collapse: collapse;
            display: table;
            table-layout: fixed;
            flex-shrink: 0;
            border: 1px solid #000;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          .print-preview-document .print-table th {
            background-color: #f3f4f6;
            font-weight: bold;
            border: 1px solid #000;
            padding: 2.5mm 2.5mm;
            text-align: center;
            font-size: 9pt;
            height: auto;
            color: black;
            display: table-cell;
            box-sizing: border-box;
          }

          /* Fixed floor height per row so all 8 rows (real + blank filler)
             are always evenly sized and the table always occupies the same
             vertical footprint on every page, regardless of item count.
             Wrapped long descriptions can still grow a row past this floor;
             the page's overflow:hidden keeps that from displacing the
             signature section rather than letting it grow unbounded. */
          .print-preview-document .print-table td {
            border: 1px solid #000;
            padding: 1.5mm 2.5mm;
            height: 15mm;
            vertical-align: top;
            font-size: 9pt;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            color: black;
            background: white;
            display: table-cell;
            box-sizing: border-box;
          }

          .print-preview-document .print-table tbody tr {
            display: table-row;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .print-preview-document .print-signature-area {
            width: 100%;
            padding: 4mm 8mm;
            border: 1px solid #000;
            font-size: 9pt;
            flex-shrink: 0;
            display: flex;
            justify-content: space-between;
            background: white;
            color: black;
            box-sizing: border-box;
            margin: auto 0 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          .print-preview-document .print-sig-block {
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            color: black;
          }

          .print-preview-document .print-sig-line {
            margin-top: 10mm;
            border-top: 1px solid #000;
            width: 60mm;
          }

          .print-preview-footer {
            position: sticky;
            bottom: 0;
            z-index: 10;
            background: white;
            border-top: 1px solid #ddd;
          }

          @media print {
            html,
            body {
              width: auto;
              height: auto;
              overflow: visible !important;
              background: white !important;
            }
            .print-preview-scroll {
              max-height: none !important;
              overflow: visible !important;
              padding: 0 !important;
              background: white !important;
            }
            .print-preview-document {
              width: 194mm;
              max-width: none;
              gap: 0;
            }
            .print-preview-document .dc-print-page {
              width: 194mm;
              height: 281mm;
              padding: 4mm;
              box-sizing: border-box;
              border: 1px solid #000;
              margin: 0;
              page-break-inside: avoid;
              break-inside: avoid;
              overflow: hidden;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>

        <DialogHeader className="no-print flex-shrink-0 px-5 py-4 border-b bg-white">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="print-preview-scroll">
          <div className="print-preview-document" ref={printRef}>
            {itemPages.map((pageItems, pageIndex) => (
              <PrintContent
                key={pageIndex}
                dc={dc}
                items={pageItems}
                products={products}
                customer={customer}
                supplier={supplier}
                title={title}
                startIndex={pageIndex * ITEMS_PER_PAGE}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="print-preview-footer flex flex-shrink-0 gap-2 justify-end p-4 no-print">
          <Button variant="secondary" onClick={onClose} className="no-print">
            Back
          </Button>
          <Button onClick={() => handlePrint()} className="no-print">Print</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function chunkItems(items: DeliveryChallanItem[], size: number) {
  const chunks: DeliveryChallanItem[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function PageChrome({
  dc,
  customer,
  supplier,
  title,
}: {
  dc: DeliveryChallan;
  customer: Customer | undefined;
  supplier: Supplier | undefined;
  title: string;
}) {
  const isSupplier = dc.type === "supplier";
  const partyName = isSupplier ? dc.supplier_name_snapshot : dc.customer_name_snapshot;
  const partyAddress = isSupplier ? dc.supplier_address_snapshot : dc.customer_address_snapshot;
  const partyGst = isSupplier ? supplier?.gst_number : customer?.gst_number;

  return (
    <>
      {/* Company Header */}
      <div className="print-header">
        <h1 className="print-company-name">APEX INDUSTRIAL METROLOGY LLP</h1>
        <div className="print-company-address">
          <p>Plot No. 180, SIDCO Women's Industrial Park,</p>
          <p>Thirumullaivoyal, Chennai – 600062</p>
          <p>Contact No: 6385145980 / 81</p>
        </div>
        <p className="print-company-gstin">GSTIN : 33ACMFA9989N1ZC</p>
      </div>

      {/* Title Row */}
      <div className="print-title">
        {title} — {isSupplier ? "Supplier DC" : "Customer DC"}
      </div>

      {/* Customer/Supplier Block and DC Info Block */}
      <div className="print-customer-section">
        {/* Party Block (Left 60%) */}
        <div className="print-customer-block">
          <p className="font-bold uppercase text-[8pt] text-gray-600 mb-1">{isSupplier ? "Supplier:" : "To / Consignee:"}</p>
          <p className="font-bold text-[10pt]">{partyName}</p>
          {partyAddress && (
            <p className="whitespace-pre-line text-[9pt] mt-1 leading-tight text-gray-700">{partyAddress}</p>
          )}
          {partyGst && (
            <p className="text-[8pt] mt-1">
              <span className="font-bold">GSTIN No.:</span> {partyGst}
            </p>
          )}
        </div>

        {/* DC Info Block (Right 40%) */}
        <div className="print-dc-info-block">
          <div>
            <div className="flex justify-between mb-1">
              <span className="font-bold">DC No:</span>
              <span>{dc.challan_number}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="font-bold">DC Date:</span>
              <span>{new Date(dc.challan_date).toLocaleDateString()}</span>
            </div>
            <div className="border-t border-dotted border-gray-300 pt-1 mt-1">
              <div className="flex justify-between mb-1">
                <span className="font-bold">Inward No:</span>
                <span className="border-b border-gray-300 w-20"></span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold">Inward Date:</span>
                <span className="border-b border-gray-300 w-20"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SignatureBlock({ isSupplier }: { isSupplier: boolean }) {
  return (
    <div className="print-signature-area">
      <div className="print-sig-block">
        <p className="text-[8pt] font-semibold">For Apex Industrial Metrology Pvt Ltd</p>
        <div className="print-sig-line"></div>
        <p className="text-[7pt] text-gray-600">Authorized Signatory</p>
      </div>
      <div className="print-sig-block">
        <p className="text-[8pt] font-semibold">{isSupplier ? "Supplier's Signature & Seal" : "Receiver's Signature & Seal"}</p>
        <div className="print-sig-line"></div>
        <p className="text-[7pt] text-gray-600">{isSupplier ? "Signature of Supplier" : "Signature of Consignee"}</p>
      </div>
    </div>
  );
}

function PrintContent({
  dc,
  items,
  products,
  customer,
  supplier,
  title,
  startIndex,
}: {
  dc: DeliveryChallan;
  items: DeliveryChallanItem[];
  products: Product[];
  customer: Customer | undefined;
  supplier: Supplier | undefined;
  title: string;
  startIndex: number;
}) {
  const isSupplier = dc.type === "supplier";
  // Only actual items get a row — no filler rows. The page (a fixed-height
  // flex column, see .dc-print-page) pins the signature to the bottom via
  // margin-top:auto on .print-signature-area, so whatever height the table
  // doesn't use simply stays blank above the signature, keeping the
  // signature's position fixed regardless of how many rows are on the page.

  return (
    <div className="dc-print-page">
      <PageChrome dc={dc} customer={customer} supplier={supplier} title={title} />

      {/* Items Table */}
      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: "6%" }}>SL.No</th>
            <th style={{ width: "14%" }}>Item Code</th>
            <th style={{ width: "34%" }} className="text-left">Description</th>
            <th style={{ width: "16%" }}>DC Qty/UOM</th>
            <th style={{ width: "30%" }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const prod = products.find((p) => p.id === item.product_id);
            const name = item.product_id ? prod?.name ?? item.item_name ?? "" : item.item_name ?? "";
            const code = item.item_code || prod?.part_no || prod?.code || "";
            const desc = item.description || "";
            const qtyUom = `${item.quantity} ${item.uom}`;
            return (
              <tr key={item.id}>
                <td className="text-center">{startIndex + idx + 1}</td>
                <td className="text-center align-top">{code}</td>
                <td className="align-top">
                  <div className="font-medium">{name}</div>
                  {desc && <div className="text-[8pt] text-gray-600 mt-0.5 whitespace-pre-line">{desc}</div>}
                </td>
                <td className="text-center align-top">{qtyUom}</td>
                <td className="align-top">{item.remarks ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Signature Area — appears on EVERY page, at the bottom of that page's form */}
      <SignatureBlock isSupplier={isSupplier} />
    </div>
  );
}
