import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Suppliers from "@/pages/suppliers/Suppliers";
import SupplierDetail from "@/pages/suppliers/SupplierDetail";

export default function SupplierRoutes() {
  return (
    <Routes>
      <Route path="" element={<ProtectedRoute requiredModule="suppliers"><Suppliers /></ProtectedRoute>} />
      <Route path=":id" element={<ProtectedRoute requiredModule="suppliers"><SupplierDetail /></ProtectedRoute>} />
    </Routes>
  );
}
