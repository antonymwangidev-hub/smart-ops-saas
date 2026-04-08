import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

export interface OrderLineItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
}

interface OrderItemsEditorProps {
  items: OrderLineItem[];
  onChange: (items: OrderLineItem[]) => void;
  products: Product[];
}

export function OrderItemsEditor({ items, onChange, products }: OrderItemsEditorProps) {
  const { formatAmount } = useCurrency();
  const [selectedProductId, setSelectedProductId] = useState("");

  const addItem = () => {
    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;
    // Don't allow duplicate products
    if (items.some((i) => i.product_id === product.id)) return;
    onChange([
      ...items,
      { product_id: product.id, product_name: product.name, quantity: 1, unit_price: product.price },
    ]);
    setSelectedProductId("");
  };

  const updateQuantity = (idx: number, qty: number) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, quantity: Math.max(1, qty) } : item));
    onChange(updated);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  const availableProducts = products.filter((p) => !items.some((i) => i.product_id === p.id));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Add a product…" />
          </SelectTrigger>
          <SelectContent>
            {availableProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} — {formatAmount(p.price)} (stock: {p.stock_quantity})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="icon" variant="outline" onClick={addItem} disabled={!selectedProductId}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {items.length > 0 && (
        <div className="border rounded-md divide-y">
          {items.map((item, idx) => (
            <div key={item.product_id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{item.product_name}</span>
              <Input
                type="number"
                min={1}
                className="w-16 h-8 text-center"
                value={item.quantity}
                onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 1)}
              />
              <span className="w-20 text-right text-muted-foreground">
                {formatAmount(item.quantity * item.unit_price)}
              </span>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeItem(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 font-medium text-sm bg-muted/50">
            <span>Total</span>
            <span>{formatAmount(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
