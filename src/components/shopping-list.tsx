"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import type { ShoppingList } from "@/lib/ai/schemas";

type ShoppingListViewProps = {
  list: ShoppingList;
};

export function ShoppingListView({ list }: ShoppingListViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Shopping list</h3>
        <Badge variant="outline">{list.currency}</Badge>
      </div>

      {list.notes && (
        <p className="text-xs text-muted-foreground">{list.notes}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {list.items.map((item, index) => (
          <Card key={`${item.name}-${index}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{item.name}</CardTitle>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {item.category}
                </Badge>
              </div>
              <CardDescription className="text-sm">{item.why}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Est. price</span>
                <span className="font-medium text-foreground">
                  {item.estPriceRange} {list.currency}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Dimensions</span>
                <span>{item.approxDimensions}</span>
              </div>
              <div className="pt-1">
                <p className="mb-1 text-xs text-muted-foreground">Retailers</p>
                <div className="flex flex-wrap gap-1">
                  {item.retailers.map((retailer) => (
                    <Badge key={retailer} variant="outline" className="text-xs">
                      {retailer}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <Search className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Search:</span>
                <span className="font-medium">{item.searchQuery}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
