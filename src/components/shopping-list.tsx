"use client";

import { Search } from "lucide-react";
import type { ShoppingList } from "@/lib/ai/schemas";

type ShoppingListViewProps = {
  list: ShoppingList;
};

export function ShoppingListView({ list }: ShoppingListViewProps) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-[28px] font-extrabold tracking-[-0.02em]">
            Shopping list
          </h3>
          <span className="rounded-full bg-muted px-3 py-1.5 text-[13px] font-bold">
            {list.currency}
          </span>
        </div>
        {list.notes && (
          <span className="text-[13px] font-medium text-faint">
            {list.notes}
          </span>
        )}
      </div>

      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
        {list.items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="mb-5 break-inside-avoid overflow-hidden rounded-3xl border border-border bg-background"
          >
            <div className="flex flex-col gap-2.5 p-4.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-bold">{item.name}</span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold">
                  {item.category}
                </span>
              </div>
              <span className="text-sm leading-normal text-muted-foreground">
                {item.why}
              </span>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. price</span>
                <span className="font-bold">{item.estPriceRange}</span>
              </div>
              <div className="flex justify-between text-[13px] text-muted-foreground">
                <span>Dimensions</span>
                <span>{item.approxDimensions}</span>
              </div>
              {item.retailers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {item.retailers.map((retailer) => (
                    <span
                      key={retailer}
                      className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold"
                    >
                      {retailer}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                <span className="text-[13px] font-semibold">
                  {item.searchQuery}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
