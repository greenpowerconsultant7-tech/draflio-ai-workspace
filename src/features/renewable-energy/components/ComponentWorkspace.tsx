import { useEffect, useRef, useState } from "react";
import {
  compatibilityReview,
  displayEngineeringValue,
  findDuplicateComponents,
  serializeComponentLibrary,
  serializeComponentRecord,
  transitionComponent,
} from "../../../../shared/renewableEnergy/components/componentCore";
import {
  csvTemplate,
  parseComponentCsv,
  parseComponentJson,
  type ImportPreview,
} from "../../../../shared/renewableEnergy/components/componentImport";
import {
  createManualComponent,
  type ManualComponentInput,
} from "../../../../shared/renewableEnergy/components/componentManual";
import type {
  CompatibilityAssumptions,
  CompatibilityResult,
  ComponentRecord,
  InverterRecord,
  PvModuleRecord,
} from "../../../../shared/renewableEnergy/components/componentTypes";
import { Breadcrumbs, RenewablePage, StatusBadge } from "../RenewableShell";

const button =
  "rounded-xl border border-glass-border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const input =
  "mt-1 w-full rounded-lg border border-glass-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ComponentWorkspace() {
  const [records, setRecords] = useState<ComponentRecord[]>([]);
  const [type, setType] = useState<"pv-module" | "inverter">("pv-module");
  const [form, setForm] = useState<Record<string, string>>(moduleDefaults);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [compatibility, setCompatibility] = useState<CompatibilityResult[]>([]);
  const [assumptions, setAssumptions] = useState<Record<string, string>>({
    minimumCellTemperatureC: "-10",
    maximumCellTemperatureC: "70",
    modulesPerString: "20",
    parallelStrings: "2",
    stringsPerMppt: "2",
    designMarginPercent: "0",
  });
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      generation.current += 1;
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const changeType = (next: typeof type) => {
    setType(next);
    setForm(next === "pv-module" ? moduleDefaults : inverterDefaults);
    setError(null);
  };
  const saveManual = () => {
    try {
      const record = createManualComponent(
        { ...form, componentType: type } as ManualComponentInput,
        records.length + 1,
      );
      setRecords((current) =>
        editingId
          ? current.map((existing) =>
              existing.recordId === editingId
                ? {
                    ...record,
                    recordId: editingId,
                    changeHistory: [
                      ...existing.changeHistory,
                      { sequence: existing.changeHistory.length + 1, action: "edited" },
                    ],
                  }
                : existing,
            )
          : [...current, record],
      );
      setEditingId(null);
      setForm(type === "pv-module" ? moduleDefaults : inverterDefaults);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Component could not be created.");
    }
  };
  const updateRecord = (
    id: string,
    action: "reviewed" | "approved" | "approval-revoked" | "excluded" | "restored",
  ) => {
    try {
      const target = records.find((record) => record.recordId === id);
      if (!target) throw new Error("Component record is no longer available.");
      const transitioned = transitionComponent(target, action);
      setRecords((current) =>
        current.map((record) => (record.recordId === id ? transitioned : record)),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review transition is invalid.");
    }
  };
  const duplicate = (record: ComponentRecord) => {
    const copy = structuredClone(record);
    copy.recordId = `${record.recordId}-copy-${records.length + 1}`;
    copy.reviewStatus =
      record.componentType === "pv-module"
        ? "manually-entered-review-required"
        : "manually-entered-review-required";
    copy.changeHistory = [
      ...copy.changeHistory,
      { sequence: copy.changeHistory.length + 1, action: "duplicated" },
    ];
    setRecords((current) => [...current, copy]);
  };
  const readImport = async (file: File, importType: typeof type | "json") => {
    generation.current += 1;
    const current = generation.current;
    setImportStatus("Reading browser-local component file");
    setPreview(null);
    setError(null);
    try {
      const text = await file.text();
      if (current !== generation.current) return;
      const imported = (() => {
        if (importType !== "json") return parseComponentCsv(text, importType);
        const parsed = parseComponentJson(text);
        return {
          records: parsed,
          rows: parsed.map((record, index) => ({
            rowNumber: index + 1,
            recordId: record.recordId,
            selected: true,
            findings: record.findings.map((finding) => finding.explanation),
          })),
          duplicateGroups: findDuplicateComponents(parsed),
        };
      })();
      if (current !== generation.current) return;
      setPreview(imported);
      setImportStatus("Import preview ready — confirm selected valid rows");
    } catch (caught) {
      if (current !== generation.current) return;
      setError(caught instanceof Error ? caught.message : "Import failed safely.");
      setImportStatus(null);
    }
  };
  const download = (content: string, filename: string, mediaType: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mediaType }));
    urls.current.push(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    queueMicrotask(() => {
      URL.revokeObjectURL(url);
      urls.current = urls.current.filter((value) => value !== url);
    });
  };
  const runCompatibility = () => {
    const module = records.find(
      (record): record is PvModuleRecord =>
        record.componentType === "pv-module" &&
        record.reviewStatus === "approved-for-current-project",
    );
    const inverter = records.find(
      (record): record is InverterRecord =>
        record.componentType === "inverter" &&
        record.reviewStatus === "approved-for-current-project",
    );
    if (!module || !inverter) return setError("Approve one reviewed module and inverter first.");
    try {
      const values: CompatibilityAssumptions = {
        minimumCellTemperatureC: Number(assumptions.minimumCellTemperatureC),
        maximumCellTemperatureC: Number(assumptions.maximumCellTemperatureC),
        modulesPerString: Number(assumptions.modulesPerString),
        parallelStrings: Number(assumptions.parallelStrings),
        stringsPerMppt: assumptions.stringsPerMppt ? Number(assumptions.stringsPerMppt) : undefined,
        designMarginFraction: Number(assumptions.designMarginPercent) / 100,
      };
      setCompatibility(compatibilityReview(module, inverter, values));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Compatibility assumptions are invalid.");
    }
  };
  const startOver = () => {
    generation.current += 1;
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setRecords([]);
    setPreview(null);
    setSelected([]);
    setCompatibility([]);
    setError(null);
    setImportStatus(null);
    setForm(type === "pv-module" ? moduleDefaults : inverterDefaults);
    setEditingId(null);
  };
  const compared = records.filter((record) => selected.includes(record.recordId)).slice(0, 8);
  return (
    <RenewablePage>
      <Breadcrumbs
        items={[
          { label: "Renewable Energy", to: "/renewable-energy" },
          { label: "Solar PV", to: "/renewable-energy/solar" },
          { label: "Component Intelligence" },
        ]}
      />
      <section className="border-b border-glass-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <StatusBadge>COMPONENT INTELLIGENCE TECHNICAL PREVIEW</StatusBadge>
          <h1 className="mt-4 text-4xl font-bold">PV Module and Inverter Component Intelligence</h1>
          <p className="mt-4 max-w-4xl text-muted-foreground">
            Versioned, source-traceable component records with explicit units, engineer review,
            deterministic preliminary compatibility checks, and browser-local import/export.
            Approval means approval only for the current Draflio project.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm">
            {error}
          </p>
        )}
        <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-2xl font-semibold">1. Manual component entry</h2>
          <div className="mt-4 flex gap-2" role="group" aria-label="Component type">
            <button
              className={button}
              aria-pressed={type === "pv-module"}
              onClick={() => changeType("pv-module")}
            >
              PV module
            </button>
            <button
              className={button}
              aria-pressed={type === "inverter"}
              onClick={() => changeType("inverter")}
            >
              Inverter
            </button>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Manufacturer"
              name="manufacturer"
              form={form}
              setForm={setForm}
              required
            />
            <Field label="Model" name="model" form={form} setForm={setForm} required />
            <Field label="Variant or revision" name="variant" form={form} setForm={setForm} />
            <Field
              label="Datasheet revision"
              name="datasheetRevision"
              form={form}
              setForm={setForm}
            />
            <Field label="Reviewer notes" name="reviewerNotes" form={form} setForm={setForm} />
            {type === "pv-module" ? (
              <>
                <h3 className="col-span-full text-lg font-semibold">Identification and STC</h3>
                <Field
                  label="Technology (optional)"
                  name="technology"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Construction"
                  name="bifacial"
                  values={["false", "true"]}
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Rated power"
                  name="ratedPower"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Unit
                  label="Rated power unit"
                  name="ratedPowerUnit"
                  values={["W", "kW"]}
                  form={form}
                  setForm={setForm}
                />
                <Field label="Vmp (V)" name="vmp" form={form} setForm={setForm} required />
                <Field label="Imp (A)" name="imp" form={form} setForm={setForm} required />
                <Field label="Voc (V)" name="voc" form={form} setForm={setForm} required />
                <Field label="Isc (A)" name="isc" form={form} setForm={setForm} required />
                <Field
                  label="Power tolerance (optional)"
                  name="powerTolerance"
                  form={form}
                  setForm={setForm}
                />
                <h3 className="col-span-full text-lg font-semibold">Temperature</h3>
                <Field
                  label="Pmax temperature coefficient"
                  name="pmaxTemperatureCoefficient"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Voc temperature coefficient"
                  name="vocTemperatureCoefficient"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Vmp temperature coefficient (optional)"
                  name="vmpTemperatureCoefficient"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Isc temperature coefficient (optional)"
                  name="iscTemperatureCoefficient"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="NOCT or supplied operating-cell temperature (°C, optional)"
                  name="nominalOperatingCellTemperature"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Coefficient unit"
                  name="coefficientUnit"
                  values={["percent/C", "fraction/C"]}
                  form={form}
                  setForm={setForm}
                />
                <h3 className="col-span-full text-lg font-semibold">Mechanical and system</h3>
                <Field label="Length (optional)" name="length" form={form} setForm={setForm} />
                <Field label="Width (optional)" name="width" form={form} setForm={setForm} />
                <Field
                  label="Thickness (optional)"
                  name="thickness"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Dimension unit"
                  name="dimensionUnit"
                  values={["mm", "cm", "m"]}
                  form={form}
                  setForm={setForm}
                />
                <Field label="Weight (kg, optional)" name="weight" form={form} setForm={setForm} />
                <Field
                  label="Cell count (optional)"
                  name="cellCount"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum system voltage (V, optional)"
                  name="maximumSystemVoltage"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum series-fuse rating (A, optional)"
                  name="maximumSeriesFuse"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Connector information (optional)"
                  name="connector"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Efficiency (optional)"
                  name="efficiency"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Efficiency unit"
                  name="efficiencyUnit"
                  values={["percent", "fraction"]}
                  form={form}
                  setForm={setForm}
                />
                <h3 className="col-span-full text-lg font-semibold">Bifacial metadata</h3>
                <Field
                  label="Bifaciality factor (optional)"
                  name="bifacialityFactor"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Rear-side rating metadata (optional)"
                  name="rearSideRatingMetadata"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Bifacial uncertainty or source note (optional)"
                  name="bifacialUncertaintyNote"
                  form={form}
                  setForm={setForm}
                />
              </>
            ) : (
              <>
                <h3 className="col-span-full text-lg font-semibold">Identification and DC input</h3>
                <Field
                  label="Inverter type (optional)"
                  name="inverterType"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum DC voltage (V)"
                  name="maximumDcVoltage"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Nominal DC voltage (V, optional)"
                  name="nominalDcVoltage"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="MPPT minimum voltage (V)"
                  name="mpptMinimumVoltage"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Startup voltage (V, optional)"
                  name="startupVoltage"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="MPPT maximum voltage (V)"
                  name="mpptMaximumVoltage"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum input current (A)"
                  name="maximumInputCurrent"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Maximum short-circuit current (A)"
                  name="maximumShortCircuitCurrent"
                  form={form}
                  setForm={setForm}
                />
                <Field label="MPPT trackers" name="mpptTrackers" form={form} setForm={setForm} />
                <Field label="Total DC inputs" name="totalDcInputs" form={form} setForm={setForm} />
                <Field
                  label="Inputs per MPPT (optional)"
                  name="inputsPerMppt"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Recommended or maximum DC power (optional)"
                  name="maximumDcPower"
                  form={form}
                  setForm={setForm}
                />
                <h3 className="col-span-full text-lg font-semibold">AC output and performance</h3>
                <Field
                  label="Rated AC power"
                  name="ratedAcPower"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Maximum AC power (optional)"
                  name="maximumAcPower"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Phase configuration"
                  name="phaseConfiguration"
                  values={["", "single-phase", "three-phase"]}
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Nominal frequency (Hz, optional)"
                  name="nominalFrequency"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum AC current (A, optional)"
                  name="maximumAcCurrent"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Power-factor range (optional)"
                  name="powerFactorRange"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Rated AC power unit"
                  name="ratedAcPowerUnit"
                  values={["W", "kW"]}
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Weighted efficiency (optional)"
                  name="weightedEfficiency"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Standby or night consumption (W, optional)"
                  name="standbyConsumption"
                  form={form}
                  setForm={setForm}
                />
                <h3 className="col-span-full text-lg font-semibold">
                  Environmental and mechanical
                </h3>
                <Field
                  label="Minimum operating temperature (°C, optional)"
                  name="minimumOperatingTemperature"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Maximum operating temperature (°C, optional)"
                  name="maximumOperatingTemperature"
                  form={form}
                  setForm={setForm}
                />
                <Field
                  label="Enclosure rating (optional)"
                  name="enclosureRating"
                  form={form}
                  setForm={setForm}
                />
                <Field label="Length (optional)" name="length" form={form} setForm={setForm} />
                <Field label="Width (optional)" name="width" form={form} setForm={setForm} />
                <Field label="Height (optional)" name="height" form={form} setForm={setForm} />
                <Unit
                  label="Dimension unit"
                  name="dimensionUnit"
                  values={["mm", "cm", "m"]}
                  form={form}
                  setForm={setForm}
                />
                <Field label="Weight (kg, optional)" name="weight" form={form} setForm={setForm} />
                <Field
                  label="Nominal AC voltage (V)"
                  name="nominalAcVoltage"
                  form={form}
                  setForm={setForm}
                  required
                />
                <Field
                  label="Maximum efficiency (optional)"
                  name="maximumEfficiency"
                  form={form}
                  setForm={setForm}
                />
                <Unit
                  label="Efficiency unit"
                  name="efficiencyUnit"
                  values={["percent", "fraction"]}
                  form={form}
                  setForm={setForm}
                />
              </>
            )}
          </div>
          <button className={`${button} mt-5`} onClick={saveManual}>
            {editingId ? "Save reviewed edit as review required" : "Save as review required"}
          </button>
        </section>
        <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-2xl font-semibold">2. CSV and JSON import</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={button}
              onClick={() =>
                download(csvTemplate("pv-module"), "draflio-pv-module-template.csv", "text/csv")
              }
            >
              Download module CSV template
            </button>
            <button
              className={button}
              onClick={() =>
                download(csvTemplate("inverter"), "draflio-inverter-template.csv", "text/csv")
              }
            >
              Download inverter CSV template
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <FileImport
              label="Module CSV"
              accept=".csv,text/csv"
              onFile={(file) => void readImport(file, "pv-module")}
            />
            <FileImport
              label="Inverter CSV"
              accept=".csv,text/csv"
              onFile={(file) => void readImport(file, "inverter")}
            />
            <FileImport
              label="Draflio component JSON"
              accept=".json,application/json"
              onFile={(file) => void readImport(file, "json")}
            />
          </div>
          {importStatus && (
            <p aria-live="polite" className="mt-4 text-sm">
              {importStatus}
            </p>
          )}
          {importStatus?.startsWith("Reading") && (
            <button
              className={`${button} mt-3`}
              onClick={() => {
                generation.current += 1;
                setImportStatus("Import cancelled safely");
              }}
            >
              Cancel import
            </button>
          )}
          {preview && (
            <div className="mt-5">
              <p className="text-sm">
                {preview.records.length} supported records;{" "}
                {preview.rows.filter((row) => !row.selected).length} rejected rows retained in
                preview.
              </p>
              {preview.duplicateGroups.map((group) => (
                <p
                  key={group.recordIds.join("-")}
                  className="mt-2 rounded-lg bg-warning/10 p-3 text-sm"
                >
                  {group.conflict}: {group.recordIds.join(", ")}
                </p>
              ))}
              <fieldset className="mt-3 space-y-2">
                <legend className="text-sm font-semibold">Rows selected for import</legend>
                {preview.rows.map((row) => (
                  <label key={row.rowNumber} className="block text-sm">
                    <input
                      type="checkbox"
                      disabled={!row.recordId}
                      checked={row.selected}
                      onChange={(event) =>
                        setPreview((current) =>
                          current
                            ? {
                                ...current,
                                rows: current.rows.map((candidate) =>
                                  candidate.rowNumber === row.rowNumber
                                    ? { ...candidate, selected: event.target.checked }
                                    : candidate,
                                ),
                              }
                            : current,
                        )
                      }
                    />{" "}
                    Row {row.rowNumber}: {row.recordId ?? "rejected"}{" "}
                    {row.findings.length ? `— ${row.findings.join("; ")}` : ""}
                  </label>
                ))}
              </fieldset>
              <button
                className={`${button} mt-3`}
                onClick={() => {
                  const included = new Set(
                    preview.rows.filter((row) => row.selected).map((row) => row.recordId),
                  );
                  setRecords((current) => [
                    ...current,
                    ...preview.records.filter((record) => included.has(record.recordId)),
                  ]);
                  setPreview(null);
                  setImportStatus("Selected import confirmed");
                }}
              >
                Confirm selected records
              </button>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-2xl font-semibold">3. Component library and engineer review</h2>
          <div className="mt-4 space-y-4">
            {records.map((record) => (
              <article key={record.recordId} className="rounded-xl border border-glass-border p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {record.manufacturer || "Missing manufacturer"} —{" "}
                      {record.model || "Missing model"}
                    </h3>
                    <p className="text-sm">
                      {record.componentType}; {record.reviewStatus}; source {record.sourceType}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Record {record.recordId}; validation {record.validationVersion}
                    </p>
                  </div>
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(record.recordId)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, record.recordId].slice(0, 8)
                            : current.filter((id) => id !== record.recordId),
                        )
                      }
                    />{" "}
                    Compare
                  </label>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {record.findings.map((finding) => (
                    <li key={`${finding.code}-${finding.field}`}>
                      {finding.severity}: {finding.field} — {finding.explanation}
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(record.parameters).map(([name, value]) => (
                    <div key={name} className="rounded-lg bg-background/60 p-2">
                      <dt className="font-medium">{name}</dt>
                      <dd>{parameterDisplay(value)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className={button}
                    onClick={() => updateRecord(record.recordId, "reviewed")}
                  >
                    Mark reviewed
                  </button>
                  <button
                    className={button}
                    onClick={() => updateRecord(record.recordId, "approved")}
                  >
                    Approve for current project
                  </button>
                  <button
                    className={button}
                    onClick={() => updateRecord(record.recordId, "approval-revoked")}
                  >
                    Revoke approval
                  </button>
                  <button
                    className={button}
                    onClick={() => updateRecord(record.recordId, "excluded")}
                  >
                    Exclude
                  </button>
                  <button
                    className={button}
                    onClick={() => updateRecord(record.recordId, "restored")}
                  >
                    Restore
                  </button>
                  <button className={button} onClick={() => duplicate(record)}>
                    Duplicate as draft
                  </button>
                  <button
                    className={button}
                    onClick={() => {
                      setType(record.componentType);
                      setForm({
                        ...(record.componentType === "pv-module"
                          ? moduleDefaults
                          : inverterDefaults),
                        ...Object.fromEntries(
                          Object.entries(record.originalImportedRecord).map(([key, value]) => [
                            key,
                            typeof value === "string" ? value : String(value ?? ""),
                          ]),
                        ),
                        reviewerNotes: record.reviewerNotes,
                      });
                      setEditingId(record.recordId);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit record
                  </button>
                </div>
              </article>
            ))}
            {!records.length && (
              <p className="text-sm text-muted-foreground">
                No component records in this browser session.
              </p>
            )}
          </div>
        </section>
        <section className="overflow-x-auto rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-2xl font-semibold">4. Component comparison</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Comparison shows normalized values and missing data. It does not rank or recommend
            components.
          </p>
          <table className="mt-4 min-w-[680px] border-collapse text-left text-sm">
            <caption className="sr-only">Selected same-session component comparison</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2">
                  Parameter
                </th>
                {compared.map((record) => (
                  <th scope="col" className="p-2" key={record.recordId}>
                    {record.manufacturer} {record.model}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                "reviewStatus",
                "sourceType",
                "ratedPower",
                "vmp",
                "imp",
                "voc",
                "isc",
                "vmpTemperatureCoefficient",
                "efficiency",
                "maximumDcVoltage",
                "mpptMinimumVoltage",
                "mpptMaximumVoltage",
                "maximumInputCurrent",
                "ratedAcPower",
                "maximumEfficiency",
              ].map((parameter) => (
                <tr key={parameter}>
                  <th scope="row" className="p-2">
                    {parameter}
                  </th>
                  {compared.map((record) => (
                    <td className="p-2" key={record.recordId}>
                      {parameter in record
                        ? String(record[parameter as keyof ComponentRecord])
                        : parameter in record.parameters
                          ? parameterValue(record, parameter)
                          : "Missing / not supplied"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rounded-2xl border border-glass-border bg-card/50 p-6">
          <h2 className="text-2xl font-semibold">5. Preliminary module–inverter compatibility</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This is a preliminary component-compatibility review. It does not replace manufacturer
            instructions, applicable standards, detailed electrical design, protection coordination,
            cable calculations, or engineer approval.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(assumptionLabels).map(([name, label]) => (
              <Field
                key={name}
                label={label}
                name={name}
                form={assumptions}
                setForm={setAssumptions}
                required
              />
            ))}
          </div>
          <button className={`${button} mt-4`} onClick={runCompatibility}>
            Run preliminary compatibility review
          </button>
          <div className="mt-5 space-y-3">
            {compatibility.map((result) => (
              <article key={result.code} className="rounded-xl bg-background/60 p-4 text-sm">
                <h3 className="font-semibold">
                  {result.code}: {result.status}
                </h3>
                <p>{result.method}</p>
                <p>
                  Calculated:{" "}
                  {result.calculatedValue === undefined
                    ? "Not evaluated"
                    : `${displayEngineeringValue(result.calculatedValue)} ${result.unit}`}
                  ; limit: {result.limit ?? "not supplied"}; margin:{" "}
                  {result.margin ?? "not evaluated"}
                </p>
                <p>Inputs: {result.inputs}; margin entered explicitly; no hidden factor.</p>
              </article>
            ))}
          </div>
        </section>
        <section className="flex flex-wrap gap-3 rounded-2xl border border-glass-border bg-card/50 p-6">
          <button
            className={button}
            disabled={!records.length}
            onClick={() =>
              download(
                serializeComponentRecord(
                  records.find((record) => selected.includes(record.recordId)) ?? records[0],
                ),
                "draflio-component.json",
                "application/json",
              )
            }
          >
            Download selected component JSON
          </button>
          <button
            className={button}
            disabled={!records.length}
            onClick={() =>
              download(
                serializeComponentLibrary(records),
                "draflio-component-library.json",
                "application/json",
              )
            }
          >
            Download component library JSON
          </button>
          <button
            className={button}
            disabled={!records.length}
            onClick={() =>
              download(
                serializeComponentLibrary(
                  records.filter(
                    (record) =>
                      record.reviewStatus === "reviewed" ||
                      record.reviewStatus === "approved-for-current-project",
                  ),
                ),
                "draflio-normalized-reviewed-components.json",
                "application/json",
              )
            }
          >
            Download normalized reviewed records
          </button>
          <button
            className={button}
            disabled={!records.length}
            onClick={() =>
              download(
                `${JSON.stringify({ records: records.map(({ recordId, reviewStatus, findings, changeHistory }) => ({ recordId, reviewStatus, findings, changeHistory })), compatibility }, null, 2)}\n`,
                "draflio-component-review.json",
                "application/json",
              )
            }
          >
            Download review report JSON
          </button>
          <button className={button} onClick={startOver}>
            Start over
          </button>
        </section>
      </main>
    </RenewablePage>
  );
}

function Field({
  label,
  name,
  form,
  setForm,
  required = false,
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        className={input}
        required={required}
        aria-required={required}
        value={form[name] ?? ""}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
      />
    </label>
  );
}
function Unit({
  label,
  name,
  values,
  form,
  setForm,
}: {
  label: string;
  name: string;
  values: string[];
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className={input}
        value={form[name]}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
      >
        {values.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    </label>
  );
}
function FileImport({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept: string;
  onFile: (file: File) => void;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        type="file"
        accept={accept}
        className="mt-2 block w-full text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
function parameterValue(record: ComponentRecord, key: string) {
  const value = (record.parameters as unknown as Record<string, unknown>)[key];
  if (!value || typeof value !== "object" || !("normalizedValue" in value))
    return "Missing / not supplied";
  const engineering = value as {
    normalizedValue: number;
    canonicalUnit: string;
    originalValue: number;
    originalUnit: string;
  };
  return `${displayEngineeringValue(engineering.normalizedValue)} ${engineering.canonicalUnit} (original ${engineering.originalValue} ${engineering.originalUnit})`;
}
function parameterDisplay(value: unknown) {
  if (value === undefined || value === null || value === "") return "Unknown / not supplied";
  if (typeof value !== "object" || !("normalizedValue" in value)) return String(value);
  const engineering = value as {
    normalizedValue: number;
    canonicalUnit: string;
    originalValue: number;
    originalUnit: string;
  };
  return `${displayEngineeringValue(engineering.normalizedValue)} ${engineering.canonicalUnit}; original ${displayEngineeringValue(engineering.originalValue)} ${engineering.originalUnit}`;
}
const moduleDefaults = {
  manufacturer: "",
  model: "",
  variant: "",
  datasheetRevision: "",
  technology: "",
  bifacial: "false",
  ratedPower: "",
  ratedPowerUnit: "W",
  vmp: "",
  imp: "",
  voc: "",
  isc: "",
  pmaxTemperatureCoefficient: "",
  vocTemperatureCoefficient: "",
  vmpTemperatureCoefficient: "",
  iscTemperatureCoefficient: "",
  nominalOperatingCellTemperature: "",
  coefficientUnit: "percent/C",
  length: "",
  width: "",
  thickness: "",
  dimensionUnit: "mm",
  weight: "",
  cellCount: "",
  efficiency: "",
  efficiencyUnit: "percent",
  powerTolerance: "",
  maximumSystemVoltage: "",
  maximumSeriesFuse: "",
  connector: "",
  bifacialityFactor: "",
  rearSideRatingMetadata: "",
  bifacialUncertaintyNote: "",
};
const inverterDefaults = {
  manufacturer: "",
  model: "",
  variant: "",
  datasheetRevision: "",
  inverterType: "",
  maximumDcVoltage: "",
  nominalDcVoltage: "",
  mpptMinimumVoltage: "",
  mpptMaximumVoltage: "",
  startupVoltage: "",
  maximumInputCurrent: "",
  maximumShortCircuitCurrent: "",
  mpptTrackers: "",
  totalDcInputs: "",
  inputsPerMppt: "",
  maximumDcPower: "",
  ratedAcPower: "",
  ratedAcPowerUnit: "kW",
  nominalAcVoltage: "",
  maximumAcPower: "",
  phaseConfiguration: "",
  nominalFrequency: "",
  maximumAcCurrent: "",
  powerFactorRange: "",
  maximumEfficiency: "",
  weightedEfficiency: "",
  standbyConsumption: "",
  efficiencyUnit: "percent",
  minimumOperatingTemperature: "",
  maximumOperatingTemperature: "",
  enclosureRating: "",
  length: "",
  width: "",
  height: "",
  dimensionUnit: "mm",
  weight: "",
};
const assumptionLabels = {
  minimumCellTemperatureC: "Minimum expected cell temperature (°C)",
  maximumCellTemperatureC: "Maximum expected cell temperature (°C)",
  modulesPerString: "Modules per string",
  parallelStrings: "Parallel strings",
  stringsPerMppt: "Strings per MPPT (optional)",
  designMarginPercent: "User-entered design margin (%)",
};
