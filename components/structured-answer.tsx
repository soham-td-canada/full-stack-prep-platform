import type { Question } from "@/lib/model";
import { readStructuredAnswer } from "@/lib/structured";

export default function StructuredAnswer({ question, answer, disabled, onChange }: {
  question: Question; answer: string; disabled: boolean; onChange: (answer: string) => void;
}) {
  const values = readStructuredAnswer(answer);
  function update(id: string, selected: string[]) {
    onChange(JSON.stringify({ ...values, [id]: selected }));
  }
  return <div className="space-y-5">
    {question.structured!.fields.map((field) => field.kind === "text" ? (
      <div key={field.id}>
        <label className="block font-semibold" htmlFor={`field-${field.id}`}>{field.label}</label>
        <input className="mt-2 block w-full border border-gray-500 p-3" id={`field-${field.id}`} value={values[field.id]?.[0] ?? ""} disabled={disabled}
          autoComplete="off" spellCheck={false} required onChange={(e) => update(field.id, [e.target.value])} />
      </div>
    ) : field.multiple ? (
      <fieldset key={field.id} disabled={disabled} className="space-y-2 border border-gray-300 p-3">
        <legend className="font-semibold">{field.label} (select all that apply)</legend>
        {field.choices.map((choice) => <label key={choice.id} className="flex items-center gap-3">
          <input type="checkbox" checked={values[field.id]?.includes(choice.id) ?? false}
            onChange={(e) => update(field.id, e.target.checked ? [...(values[field.id] ?? []), choice.id]
              : (values[field.id] ?? []).filter((id) => id !== choice.id))} />
          {choice.label}
        </label>)}
      </fieldset>
    ) : (
      <div key={field.id}>
        <label className="block font-semibold" htmlFor={`field-${field.id}`}>{field.label}</label>
        <select className="mt-2 block w-full border border-gray-500 p-3 font-normal" id={`field-${field.id}`} value={values[field.id]?.[0] ?? ""} required disabled={disabled}
          onChange={(e) => update(field.id, [e.target.value])}>
          <option value="">Select an answer</option>
          {field.choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        </select>
      </div>
    ))}
  </div>;
}
