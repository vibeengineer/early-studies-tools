import { Action, io, ctx } from "@interval/sdk";
import { generateText } from "ai";
import { getViewRecords, updateRecord } from "../../services/airtable";
import { AI_MODEL_OPTIONS, getModelByKey } from "../../utils/ai-models";
import { selectAirtableBaseConfig, buildFilterFormula } from "../../utils/airtable";
import PQueue from "p-queue";

function generateProcessingPrompt({
  sourceData,
  instruction,
}: {
  sourceData: { [key: string]: unknown };
  instruction: string;
}) {
  const dataDescription = Object.entries(sourceData)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `You are an AI assistant helping to process data. Based on the provided data, follow the instruction exactly as specified.

Data:
${dataDescription}

Instruction: ${instruction}

Output:`;
}

export default new Action({
  backgroundable: true,
  name: "AI Processor",
  description: "Process Airtable records with custom AI instructions using GPT models",
  handler: async () => {
    const config = await selectAirtableBaseConfig();

    const { sourceFields, targetField, instruction, selectedModel, queueConcurrency, queueIntervalCap, queueInterval } = await io
      .group({
        sourceFields: io
          .search("Select Source Fields for Context", {
            helpText: "Search and select fields that will provide context to the AI for processing (optional - if none selected, full record will be used)",
            onSearch: async (query) => {
              return config.selectedTable.fields.filter(
                (field) =>
                  field.name.toLowerCase().includes(query.toLowerCase()) ||
                  field.type.toLowerCase().includes(query.toLowerCase())
              );
            },
            renderResult: (field) => ({
              label: `${field.name} (${field.type})`,
              description: `Field type: ${field.type}`,
            }),
            initialResults: config.selectedTable.fields,
          })
          .multiple()
          .optional(),
        targetField: io.select.single("Select Target Field", {
          helpText: "The field where the AI-processed results will be stored",
          options: config.selectedTable.fields.map((field) => ({
            label: field.name,
            value: field.id,
          })),
        }),
        instruction: io.input.text("AI Instruction", {
          helpText: "Tell the AI what you want it to do with the source data",
          placeholder:
            "e.g., Shorten this company description to 50 words, Write a haiku using the person's name, Create a marketing tagline based on the company info",
        }),
        selectedModel: io.select.single("Select AI Model", {
          helpText: "Choose the AI model for processing",
          options: AI_MODEL_OPTIONS,
          defaultValue: AI_MODEL_OPTIONS[0],
        }),
        queueConcurrency: io.input.number("Queue Concurrency", {
          helpText: "Number of concurrent requests (optional, defaults to 100)",
          min: 1,
          max: 200,
          placeholder: "100",
        }).optional(),
        queueIntervalCap: io.input.number("Queue Interval Cap", {
          helpText: "Maximum requests per interval (optional, defaults to 50)",
          min: 1,
          max: 100,
          placeholder: "50",
        }).optional(),
        queueInterval: io.input.number("Queue Interval (ms)", {
          helpText: "Interval duration in milliseconds (optional, defaults to 1000)",
          min: 100,
          max: 10000,
          placeholder: "1000",
        }).optional(),
      })
      .validate(({ targetField }) => {
        const targetFieldObj = config.selectedTable.fields.find((f) => f.id === targetField.value);
        if (
          !targetFieldObj ||
          (targetFieldObj.type !== "singleLineText" &&
            targetFieldObj.type !== "multilineText" &&
            targetFieldObj.type !== "richText")
        ) {
          return "Target field must be a Single Line Text, Multiple Line Text, or Rich Text field type";
        }
      });

    const targetFieldName = config.selectedTable.fields.find(
      (f: any) => f.id === targetField.value
    )?.name;

    const combinedFormula = buildFilterFormula(
      config.filterByFormula,
      targetFieldName,
      config.overrideExisting
    );

    const records = await getViewRecords({
      baseId: config.baseId,
      tableId: config.tableId,
      viewId: config.viewId,
      filterByFormula: combinedFormula,
      maxRecords: config.recordsToProcessLimit,
    });

    const shouldProceed = await io.confirm(`Process ${records.length} records?`, {
      helpText: `This will modify ${records.length} records in your Airtable. This action cannot be undone.`,
    });

    if (!shouldProceed) {
      return "Action cancelled by user.";
    }

    await ctx.log(`Found ${records.length} records to process`);

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const selectedModelKey = typeof selectedModel === "string" ? selectedModel : selectedModel.value;
    const { model, name } = getModelByKey(selectedModelKey);
    await ctx.log(`Using model: ${name}`);

    await ctx.loading.start({
      label: "Processing records...",
      itemsInQueue: records.length,
    });

    const tasks = records.map((record) => async () => {
      try {
        const sourceData: { [key: string]: unknown } = {};
        if (sourceFields && sourceFields.length > 0) {
          for (const field of sourceFields) {
            sourceData[field.name] = record.fields[field.name];
          }
        } else {
          // Use full record if no source fields selected
          Object.assign(sourceData, record.fields);
        }

        const prompt = generateProcessingPrompt({ sourceData, instruction });
        const result = await generateText({ model, prompt });
        const processedContent = result.text.trim();

        if (!processedContent) {
          skippedCount++;
          return;
        }

        if (!targetFieldName) {
          throw new Error("Target field name could not be determined.");
        }

        await updateRecord({
          baseId: config.baseId,
          tableId: config.tableId,
          recordId: record.id,
          fields: { [targetFieldName]: processedContent },
        });

        updatedCount++;
        await ctx.log(`Updated record ${++processedCount}/${records.length}: ${record.id}`);
        await ctx.loading.completeOne();
      } catch (error) {
        skippedCount++;
        await ctx.log(`Error processing record ${record.id}: ${error}`);
      }
    });

    const queue = new PQueue({ 
      concurrency: queueConcurrency || 100, 
      intervalCap: queueIntervalCap || 50, 
      interval: queueInterval || 1000 
    });
    await queue.addAll(tasks);

    return `AI processing complete! Processed ${processedCount} records. Updated: ${updatedCount}, Skipped: ${skippedCount}`;
  },
});
