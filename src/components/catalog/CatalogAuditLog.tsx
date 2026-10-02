// Audit trail table — who/when/field/old/new for every Catalogue CMS edit.
// Reads pricing_master_snap_audit directly (migration 039). Every row here
// was written atomically by the same DB function that made the edit
// (catalog_update_field / catalog_create_product / catalog_delete_product)
// — there is no code path that can write a catalogue change without one.
//
// CEO live-review 2026-08-03: tucked away inside CatalogHistoryPanel
// (collapsed by default) instead of always-on on the working surface — this
// component is now just the table content, no card/heading of its own.
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useCatalogAudit } from "@/data/catalogLive";

export const CatalogAuditLog = () => {
  const { data, isLoading, isError } = useCatalogAudit(100);

  return (
    <>
      {isError ? (
        <p className="text-sm text-destructive">Could not load the audit trail.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No edits recorded yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Old value</TableHead>
                <TableHead>New value</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.audit_id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.changed_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="text-xs">{row.field_name}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.old_value ?? ""}>
                    {row.old_value ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs" title={row.new_value ?? ""}>
                    {row.new_value ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.changed_by ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
};
