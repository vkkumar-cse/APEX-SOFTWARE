-- Suppliers module parity, Delivery Challan supplier support, atomic DC numbering,
-- and RLS updates so delivery_challan module-access workers can edit DCs/items.

-- ============== SUPPLIERS: add fields for full module parity ==============
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_code TEXT,
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_supplier_code_unique
  ON public.suppliers (supplier_code)
  WHERE supplier_code IS NOT NULL AND supplier_code <> '';

DROP TRIGGER IF EXISTS suppliers_touch ON public.suppliers;
CREATE TRIGGER suppliers_touch BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== DELIVERY CHALLANS: supplier support ==============
ALTER TABLE public.delivery_challans
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.delivery_challans
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supplier_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address_snapshot TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_challans_type_check') THEN
    ALTER TABLE public.delivery_challans
      ADD CONSTRAINT delivery_challans_type_check CHECK (type IN ('customer', 'supplier'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_challans_party_check') THEN
    ALTER TABLE public.delivery_challans
      ADD CONSTRAINT delivery_challans_party_check CHECK (
        (type = 'customer' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
        (type = 'supplier' AND supplier_id IS NOT NULL AND customer_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_challans_supplier ON public.delivery_challans(supplier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_type ON public.delivery_challans(type);

DROP TRIGGER IF EXISTS delivery_challans_touch ON public.delivery_challans;
CREATE TRIGGER delivery_challans_touch BEFORE UPDATE ON public.delivery_challans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== DC NUMBERING: atomic sequence-backed generator ==============
-- Replaces client-side "scan all rows and take max" logic, which is race-prone
-- and can produce duplicate/incorrect numbers under concurrent creation.
CREATE SEQUENCE IF NOT EXISTS public.dc_number_seq;

-- Seed the sequence so numbering continues from the current highest DC-<n>,
-- preserving the existing format/continuity instead of restarting at 1.
SELECT setval(
  'public.dc_number_seq',
  GREATEST(
    1,
    COALESCE((
      SELECT MAX((regexp_match(challan_number, '^DC-(\d+)$'))[1]::int)
      FROM public.delivery_challans
      WHERE challan_number ~ '^DC-\d+$'
    ), 0)
  ),
  true
);

CREATE OR REPLACE FUNCTION public.next_dc_number()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'DC-' || nextval('public.dc_number_seq')::text
$$;

GRANT EXECUTE ON FUNCTION public.next_dc_number() TO authenticated;

-- ============== RLS: delivery_challans ==============
-- Header create/delete stay admin-only (matches existing UI, which only shows
-- Create/Delete DC to admins). Header edits (date, party, returnable, notes)
-- are opened up to workers with delivery_challan module access, per product decision.
DROP POLICY IF EXISTS "Admins manage delivery challans" ON public.delivery_challans;

CREATE POLICY "Admins insert delivery challans"
  ON public.delivery_challans FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins delete delivery challans"
  ON public.delivery_challans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admin or DC users update delivery challans"
  ON public.delivery_challans FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  );

-- ============== RLS: delivery_challan_items ==============
-- Item add/edit/remove is opened up to workers with delivery_challan module
-- access (this already matched the pre-existing UI intent, which showed
-- Add/Remove Item controls to any user regardless of admin status while a DC
-- was in draft — but was silently blocked by the previous admin-only policy).
DROP POLICY IF EXISTS "Admins manage delivery challan items" ON public.delivery_challan_items;

CREATE POLICY "Admin or DC users insert delivery challan items"
  ON public.delivery_challan_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  );

CREATE POLICY "Admin or DC users update delivery challan items"
  ON public.delivery_challan_items FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  );

CREATE POLICY "Admin or DC users delete delivery challan items"
  ON public.delivery_challan_items FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND COALESCE(p.status, 'pending') = 'approved'
        AND COALESCE(p.module_access, '[]'::jsonb) ? 'delivery_challan'
    )
  );
