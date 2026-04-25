import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ElicitationContentValue,
  ElicitationPropertySchema,
  ElicitationResponse,
} from "../lib/acp/types";
import type { PendingElicitation } from "../lib/types";

interface ElicitationDialogProps {
  requests: PendingElicitation[];
  onRespond: (requestId: string, response: ElicitationResponse) => void;
}

type DraftContent = Record<string, ElicitationContentValue>;

export function ElicitationDialog({ requests, onRespond }: ElicitationDialogProps): React.ReactElement | null {
  if (requests.length === 0) return null;
  return (
    <div className="elicitation-panel">
      {requests.map((request) => (
        <ElicitationCard key={request.requestId} request={request} onRespond={onRespond} />
      ))}
    </div>
  );
}

function ElicitationCard({
  request,
  onRespond,
}: {
  request: PendingElicitation;
  onRespond: (requestId: string, response: ElicitationResponse) => void;
}): React.ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);
  const fields = useMemo(() => Object.entries(request.schema.properties ?? {}), [request.schema.properties]);
  const required = new Set(request.schema.required ?? []);
  const [draft, setDraft] = useState<DraftContent>(() => buildInitialContent(fields));

  const setField = (key: string, value: ElicitationContentValue) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const canSubmit = fields.every(([key, schema]) => {
    if (!required.has(key)) return true;
    const value = draft[key];
    if (schema.type === "array") return Array.isArray(value) && value.length > 0;
    return value !== undefined && value !== "";
  });

  const submit = useCallback(() => {
    if (!canSubmit) return;
    onRespond(request.requestId, { action: "accept", content: draft });
  }, [canSubmit, draft, onRespond, request.requestId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const first = cardRef.current?.querySelector<HTMLElement>("[data-elicit-focus='true']");
      first?.focus();
    });
  }, [request.requestId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onRespond(request.requestId, { action: "cancel" });
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !isChoiceTarget(event.target)) {
        event.preventDefault();
        submit();
      }
    },
    [onRespond, request.requestId, submit],
  );

  return (
    <div ref={cardRef} className="elicitation-card" onKeyDown={handleKeyDown}>
      <div className="elicitation-card-header">
        <span className="elicitation-icon" aria-hidden>?</span>
        <span>{request.schema.title ?? "Input required"}</span>
      </div>
      <div className="elicitation-body">{request.message}</div>
      {request.schema.description && <div className="elicitation-description">{request.schema.description}</div>}

      <div className="elicitation-fields">
        {fields.map(([key, schema], index) => (
          <ElicitationField
            key={key}
            fieldKey={key}
            schema={schema}
            value={draft[key]}
            required={required.has(key)}
            autoFocus={index === 0}
            onChange={(value) => setField(key, value)}
            onSubmit={submit}
          />
        ))}
      </div>

      <div className="elicitation-actions">
        <button
          type="button"
          className="elicitation-action elicitation-submit"
          disabled={!canSubmit}
          onClick={submit}
        >
          Submit
        </button>
        <button
          type="button"
          className="elicitation-action"
          onClick={() => onRespond(request.requestId, { action: "decline" })}
        >
          Decline
        </button>
        <button
          type="button"
          className="elicitation-action"
          onClick={() => onRespond(request.requestId, { action: "cancel" })}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ElicitationField({
  fieldKey,
  schema,
  value,
  required,
  autoFocus,
  onChange,
  onSubmit,
}: {
  fieldKey: string;
  schema: ElicitationPropertySchema;
  value: ElicitationContentValue | undefined;
  required: boolean;
  autoFocus: boolean;
  onChange: (value: ElicitationContentValue) => void;
  onSubmit: () => void;
}): React.ReactElement {
  const label = schema.title ?? fieldKey;
  const choices = getChoiceOptions(schema);

  return (
    <div className="elicitation-field">
      <span className="elicitation-label">
        {label}
        {required ? <span className="elicitation-required"> *</span> : null}
      </span>
      {schema.description && <span className="elicitation-help">{schema.description}</span>}
      {schema.type === "string" && choices.length > 0 ? (
        <ChoiceInput
          choices={choices}
          value={String(value ?? "")}
          autoFocus={autoFocus}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      ) : schema.type === "string" ? (
        <input
          type="text"
          value={String(value ?? "")}
          data-elicit-focus={autoFocus ? "true" : undefined}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      ) : schema.type === "boolean" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          data-elicit-focus={autoFocus ? "true" : undefined}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      ) : schema.type === "array" ? (
        <div className="elicitation-checkboxes">
          {choices.map((choice) => {
            const selected = Array.isArray(value) ? value.includes(choice.value) : false;
            return (
              <label key={choice.value} className="elicitation-checkbox">
                <input
                  type="checkbox"
                  checked={selected}
                  data-elicit-focus={autoFocus && choice === choices[0] ? "true" : undefined}
                  onChange={(event) => {
                    const current = Array.isArray(value) ? value : [];
                    onChange(
                      event.currentTarget.checked
                        ? [...current, choice.value]
                        : current.filter((item) => item !== choice.value),
                    );
                  }}
                />
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          data-elicit-focus={autoFocus ? "true" : undefined}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
      )}
    </div>
  );
}

function ChoiceInput({
  choices,
  value,
  autoFocus,
  onChange,
  onSubmit,
}: {
  choices: Array<{ value: string; label: string }>;
  value: string;
  autoFocus: boolean;
  onChange: (value: ElicitationContentValue) => void;
  onSubmit: () => void;
}): React.ReactElement {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => setActiveIndex(selectedIndex), [selectedIndex]);

  const moveTo = useCallback(
    (index: number) => {
      const next = (index + choices.length) % choices.length;
      setActiveIndex(next);
      onChange(choices[next].value);
      requestAnimationFrame(() => optionRefs.current[next]?.focus());
    },
    [choices, onChange],
  );

  return (
    <div className="elicitation-choice-list" role="listbox" aria-label="Choose an option">
      {choices.map((choice, index) => (
        <button
          key={choice.value}
          ref={(node) => {
            optionRefs.current[index] = node;
          }}
          type="button"
          role="option"
          aria-selected={choice.value === value}
          tabIndex={index === activeIndex ? 0 : -1}
          data-elicit-focus={autoFocus && index === activeIndex ? "true" : undefined}
          className={`elicitation-choice ${choice.value === value ? "selected" : ""}`}
          onFocus={() => setActiveIndex(index)}
          onClick={() => onChange(choice.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              moveTo(index + 1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              moveTo(index - 1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              onChange(choice.value);
              onSubmit();
            } else if (event.key === " ") {
              event.preventDefault();
              onChange(choice.value);
            }
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function buildInitialContent(fields: Array<[string, ElicitationPropertySchema]>): DraftContent {
  const content: DraftContent = {};
  for (const [key, schema] of fields) {
    content[key] = initialValue(schema);
  }
  return content;
}

function initialValue(schema: ElicitationPropertySchema): ElicitationContentValue {
  if (schema.type === "string") {
    const choices = getChoiceOptions(schema);
    return schema.default ?? choices[0]?.value ?? "";
  }
  if (schema.type === "boolean") return schema.default ?? false;
  if (schema.type === "array") return schema.default ?? [];
  return schema.default ?? 0;
}

function getChoiceOptions(schema: ElicitationPropertySchema): Array<{ value: string; label: string }> {
  if (schema.type === "string") {
    if (schema.oneOf && schema.oneOf.length > 0) {
      return schema.oneOf.map((option) => ({ value: option.const, label: option.title }));
    }
    if (schema.enum && schema.enum.length > 0) {
      return schema.enum.map((value) => ({ value, label: value }));
    }
  }
  if (schema.type === "array") {
    if (schema.items.oneOf && schema.items.oneOf.length > 0) {
      return schema.items.oneOf.map((option) => ({ value: option.const, label: option.title }));
    }
    if (schema.items.enum && schema.items.enum.length > 0) {
      return schema.items.enum.map((value) => ({ value, label: value }));
    }
  }
  return [];
}

function isChoiceTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.closest(".elicitation-choice-list") !== null;
}
