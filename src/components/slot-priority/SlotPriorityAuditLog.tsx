// Audit trail panel — who/when/field/old/new for every Calendario slot CMS
// edit. Reads cal_slot_priority_audit directly (migration 067). Every row
// here was written atomically by the same DB function that made the edit
// (slot_priority_update_field / slot_priority_create / slot_priority_delete
// / slot_priority_bulk_set_release_window) — there is no code path that can
// write a slot-priority change without one.
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useSlotPriorityAudit } from "@/data/slotPriorityLive";

export const SlotPriorityAuditLog = () => {
  const { data, isLoading, isError } = useSlotPriorityAudit(150);

  return (
    <Card className="p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <History className="h-4 w-4 text-gold" />
        <h3 className="text-xl font-heading tracking-wide">AUDIT TRAIL</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Every edit made in this panel — who, when, which field, old value, new value. Append-only.
      </p>

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
                <TableHead>Field</TableHead>
                <TableHead>Old value</TableHead>
                <TableHead>New value</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.audit_id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.changed_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{row.field_name}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.old_value ?? ""}>
                    {row.old_value ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs" title={row.new_value ?? ""}>
                    {row.new_value ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{row.changed_by ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={row.change_reason ?? ""}>
                    {row.change_reason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};
