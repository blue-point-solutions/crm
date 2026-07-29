import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { AppButton, Card, Screen, useToast } from "../components";
import { colors, radius, spacing, type as typo } from "../theme";
import {
  IMPORT_FIELDS,
  ImportPreview,
  ImportResult,
  fetchExport,
  importPreview,
  runImport,
} from "../api/importExport";

type Props = NativeStackScreenProps<RootStackParamList, "ImportExport">;

const FIELD_LABELS: Record<string, string> = {
  name: "Full Name",
  firstName: "First Name",
  lastName: "Last Name",
  company: "Company",
  jobTitle: "Job Title",
  email: "Email",
  phone: "Phone",
  website: "Website",
  address: "Address",
  notes: "Notes",
  source: "Source",
  tags: "Tags",
};

const PICKER_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

interface Picked {
  uri: string;
  name: string;
  mimeType?: string;
}

export default function ImportExportScreen({ navigation }: Props) {
  const toast = useToast();

  // Import state machine: none → previewing → mapped (editable) → imported
  const [file, setFile] = useState<Picked | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"preview" | "import" | "export" | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);

  const [format, setFormat] = useState<"csv" | "xlsx">("csv");

  const apiDetail = (e: any, fallback: string): string =>
    e?.response?.data?.detail ?? fallback;

  const pickFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: PICKER_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    const picked = { uri: asset.uri, name: asset.name, mimeType: asset.mimeType };
    setFile(picked);
    setResult(null);
    setPreview(null);
    setBusy("preview");
    try {
      const p = await importPreview(picked);
      setPreview(p);
      setMapping(p.suggestedMapping);
    } catch (e: any) {
      setFile(null);
      toast.show(apiDetail(e, "Couldn't read that file."), "error");
    } finally {
      setBusy(null);
    }
  }, [toast]);

  const doImport = useCallback(async () => {
    if (!file || !preview) return;
    const active = Object.fromEntries(
      Object.entries(mapping).filter(([, col]) => col)
    );
    if (Object.keys(active).length === 0) {
      toast.show("Map at least one column first.", "error");
      return;
    }
    setBusy("import");
    try {
      const r = await runImport(file, active);
      setResult(r);
      if (r.imported > 0) {
        toast.show(`Imported ${r.imported} contact${r.imported === 1 ? "" : "s"}`, "success");
      } else {
        toast.show("Nothing imported — check the errors below.", "error");
      }
    } catch (e: any) {
      toast.show(apiDetail(e, "Import failed. Check your connection."), "error");
    } finally {
      setBusy(null);
    }
  }, [file, preview, mapping, toast]);

  const doExport = useCallback(async () => {
    setBusy("export");
    try {
      const bytes = await fetchExport(format);
      const mime = format === "csv" ? "text/csv" : PICKER_TYPES[3];
      if (Platform.OS === "web") {
        // Web fallback: synthesize a download link.
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `contacts-export.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const target = new File(Paths.cache, `contacts-export.${format}`);
        if (target.exists) target.delete();
        target.write(new Uint8Array(bytes));
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(target.uri, { mimeType: mime });
        } else {
          toast.show("Sharing isn't available on this device.", "error");
        }
      }
    } catch (e: any) {
      toast.show(apiDetail(e, "Export failed. Check your connection."), "error");
    } finally {
      setBusy(null);
    }
  }, [format, toast]);

  const mappedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <Screen title="Import & Export" onBack={() => navigation.goBack()} scroll>
      {/* ── Import ─────────────────────────────────────────────────────── */}
      <Card>
        <View style={styles.cardHeader}>
          <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>Import Contacts</Text>
        </View>
        <Text style={styles.cardHint}>
          Bring contacts in from a CSV or Excel file. You'll review the column
          mapping before anything is saved.
        </Text>

        <AppButton
          title={file ? `File: ${file.name}` : "Choose CSV or Excel File"}
          variant={file ? "secondary" : "primary"}
          onPress={pickFile}
          loading={busy === "preview"}
          disabled={busy !== null}
          icon="document-attach-outline"
        />

        {preview && (
          <>
            <Text style={styles.previewMeta}>
              {preview.totalRows} row{preview.totalRows === 1 ? "" : "s"} detected ·{" "}
              {mappedCount} column{mappedCount === 1 ? "" : "s"} mapped
            </Text>
            {IMPORT_FIELDS.filter(
              (f) => mapping[f] || preview.columns.length > 0
            ).map((field) => (
              <TouchableOpacity
                key={field}
                style={styles.mapRow}
                onPress={() => setEditingField(field)}
                accessibilityRole="button"
                accessibilityLabel={`${FIELD_LABELS[field]} mapped to ${mapping[field] ?? "nothing"}`}
              >
                <Text style={styles.mapField}>{FIELD_LABELS[field]}</Text>
                <View style={styles.mapTarget}>
                  <Text
                    style={[styles.mapColumn, !mapping[field] && styles.mapSkip]}
                    numberOfLines={1}
                  >
                    {mapping[field] ?? "Not imported"}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
            <AppButton
              title={`Import ${preview.totalRows} Contact${preview.totalRows === 1 ? "" : "s"}`}
              onPress={doImport}
              loading={busy === "import"}
              disabled={busy !== null || mappedCount === 0}
            />
          </>
        )}

        {result && (
          <View style={styles.resultBox}>
            <Text style={styles.resultLine}>
              ✓ {result.imported} imported
              {result.failed > 0 ? `  ·  ${result.failed} failed` : ""}
            </Text>
            {result.errors.slice(0, 10).map((err) => (
              <Text key={err.rowNumber} style={styles.resultError}>
                Row {err.rowNumber}: {err.message}
              </Text>
            ))}
            {result.imported > 0 && (
              <AppButton
                title="View Contacts"
                variant="secondary"
                onPress={() => navigation.navigate("Contacts")}
              />
            )}
          </View>
        )}
      </Card>

      {/* ── Export ─────────────────────────────────────────────────────── */}
      <Card style={styles.exportCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="cloud-download-outline" size={20} color={colors.primary} />
          <Text style={styles.cardTitle}>Export Contacts</Text>
        </View>
        <Text style={styles.cardHint}>
          Download all your contacts as a spreadsheet.
        </Text>
        <View style={styles.formatRow}>
          {(["csv", "xlsx"] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.formatChip, format === f && styles.formatChipActive]}
              onPress={() => setFormat(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: format === f }}
              accessibilityLabel={f === "csv" ? "CSV format" : "Excel format"}
            >
              <Text
                style={[styles.formatText, format === f && styles.formatTextActive]}
              >
                {f === "csv" ? "CSV" : "Excel (XLSX)"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <AppButton
          title="Export Contacts"
          onPress={doExport}
          loading={busy === "export"}
          disabled={busy !== null}
          icon="share-outline"
        />
      </Card>

      {/* ── Column picker modal ────────────────────────────────────────── */}
      <Modal
        visible={editingField !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingField(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setEditingField(null)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingField ? FIELD_LABELS[editingField] : ""} comes from…
            </Text>
            {[undefined, ...(preview?.columns ?? [])].map((col) => (
              <TouchableOpacity
                key={col ?? "__skip__"}
                style={styles.modalRow}
                onPress={() => {
                  if (!editingField) return;
                  setMapping((m) => {
                    const next = { ...m };
                    if (col) {
                      // A column can feed only one field — steal it if needed.
                      for (const k of Object.keys(next)) {
                        if (next[k] === col) delete next[k];
                      }
                      next[editingField] = col;
                    } else {
                      delete next[editingField];
                    }
                    return next;
                  });
                  setEditingField(null);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.modalRowText, !col && styles.mapSkip]}>
                  {col ?? "Don't import this field"}
                </Text>
                {editingField && mapping[editingField] === col && (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typo.size.h3,
    fontFamily: typo.family.bold,
    fontWeight: "700",
    color: colors.text,
  },
  cardHint: {
    fontSize: typo.size.caption + 1,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 19,
  },
  previewMeta: {
    fontSize: typo.size.caption,
    color: colors.textSecondary,
    marginVertical: spacing.md,
  },
  mapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 44,
  },
  mapField: {
    fontSize: typo.size.caption + 1,
    fontFamily: typo.family.semiBold,
    fontWeight: "600",
    color: colors.text,
  },
  mapTarget: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: "55%",
  },
  mapColumn: { fontSize: typo.size.caption + 1, color: colors.primary },
  mapSkip: { color: colors.textMuted, fontStyle: "italic" },
  resultBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  resultLine: {
    fontSize: typo.size.caption + 1,
    fontFamily: typo.family.semiBold,
    fontWeight: "600",
    color: colors.text,
  },
  resultError: { fontSize: typo.size.caption, color: colors.error },
  exportCard: { marginTop: spacing.lg },
  formatRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  formatChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  formatChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  formatText: { fontSize: typo.size.caption + 1, color: colors.textSecondary },
  formatTextActive: { color: colors.white, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: typo.size.body,
    fontFamily: typo.family.bold,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 44,
  },
  modalRowText: { fontSize: typo.size.caption + 2, color: colors.text },
});
