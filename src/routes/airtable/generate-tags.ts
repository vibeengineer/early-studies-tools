import { Action, io, ctx } from "@interval/sdk";
import { generateText } from "ai";
import { getViewRecords, updateRecord } from "../../services/airtable";
import { AI_MODEL_OPTIONS, getModelByKey } from "../../utils/ai-models";
import { selectAirtableBaseConfig, buildFilterFormula } from "../../utils/airtable";
import PQueue from "p-queue";

function generateTagCreationPrompt({
  sourceData,
  possibleTags,
  multipleTags,
  customInstructions,
}: {
  sourceData: { [key: string]: unknown };
  possibleTags: string[];
  multipleTags: boolean;
  customInstructions: string;
}) {
  const dataDescription = Object.entries(sourceData)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  const tagList = possibleTags.map((tag) => `- ${tag}`).join("\n");

  const customInstructionsSection = `\nCustom Instructions:\n${customInstructions}\n`;

  if (multipleTags) {
    return `Based on the following data, select one or more relevant tags from the provided list. Return only the selected tags as a comma-separated list (e.g., "tag1, tag2, tag3"). If no tags are relevant, return "none".${customInstructionsSection}

Data:
${dataDescription}

Available tags:
${tagList}

Selected tags:`;
  }
  return `Based on the following data, select the most relevant single tag from the provided list. Return only the selected tag (e.g., "tag1"). If no tags are relevant, return "none".${customInstructionsSection}

Data:
${dataDescription}

Available tags:
${tagList}

Selected tag:`;
}

export default new Action({
  backgroundable: true,
  name: "Generate Tags",
  description: "Generate tags for Airtable records using AI",
  handler: async () => {
    // Get shared Airtable configuration
    const config = await selectAirtableBaseConfig();

    const {
      sourceFields,
      targetField,
      possibleTags,
      multipleTags,
      customInstructions,
      selectedModel,
      queueConcurrency,
      queueIntervalCap,
      queueInterval,
    } = await io
      .group({
        sourceFields: io
          .search("Select Source Fields for Context", {
            helpText: "Search and select fields that will provide context to the AI for generating tags (optional - if none selected, full record will be used)",
            onSearch: async (query) => {
              return config.selectedTable.fields.filter((field) => 
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
          helpText: "The field where the generated tags will be stored",
          options: config.selectedTable.fields.map((field) => ({
            label: field.name,
            value: field.id,
          })),
        }),
        possibleTags: io.input.text("Possible Tags", {
          helpText: "Enter a comma-separated list of tags that the AI can choose from",
          placeholder: "e.g., Enterprise, B2B, SaaS, Marketing, Sales, Support",
        }),
        multipleTags: io.input.boolean("Allow Multiple Tags", {
          helpText: "Allow the AI to select multiple tags per record",
          defaultValue: true,
        }),
        customInstructions: io.input.text("Custom Instructions", {
          helpText: "Custom instructions to guide the AI's tag selection",
          placeholder: "e.g., Focus on the company's primary business model and target market",
        }),
        selectedModel: io.select.single("Select AI Model", {
          helpText: "Choose the AI model for tag generation",
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
      .validate(({ targetField, possibleTags }) => {
        const targetFieldObj = config.selectedTable.fields.find((f) => f.id === targetField.value);
        if (
          !targetFieldObj ||
          (targetFieldObj.type !== "singleSelect" &&
            targetFieldObj.type !== "multipleSelects" &&
            targetFieldObj.type !== "singleLineText" &&
            targetFieldObj.type !== "multilineText")
        ) {
          return "Target field must be a Single Select, Multiple Select, Single Line Text, or Multiple Line Text field type";
        }
        const tagsArray = possibleTags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
        if (tagsArray.length === 0) {
          return "Please provide at least one possible tag";
        }
      });

    const targetFieldObj = config.selectedTable.fields.find((f) => f.id === targetField.value);
    const tagsArray = possibleTags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

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

    // Confirm before processing
    const shouldProceed = await io.confirm(`Generate tags for ${records.length} records?`, {
      helpText: `This will modify ${records.length} records in your Airtable. This action cannot be undone.`,
    });

    if (!shouldProceed) {
      return "Action cancelled by user.";
    }

    const selectedModelKey = typeof selectedModel === "string" ? selectedModel : selectedModel.value;
    const { model, name } = getModelByKey(selectedModelKey);
    await ctx.log(`Using model: ${name}`);

    await ctx.log(`Found ${records.length} records to process`);

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    await ctx.loading.start({
      label: "Generating tags...",
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

        const prompt = generateTagCreationPrompt({
          sourceData,
          possibleTags: tagsArray,
          multipleTags,
          customInstructions,
        });

        const result = await generateText({
          model,
          prompt,
        });

        const generatedTags = result.text.trim();

        if (generatedTags.toLowerCase() === "none") {
          skippedCount++;
          return;
        }

        let finalTags: string | string[];
        if (targetFieldObj!.type === "multipleSelects") {
          finalTags = multipleTags 
            ? generatedTags.split(",").map((tag) => tag.trim())
            : [generatedTags.trim()];
        } else if (multipleTags && targetFieldObj!.type === "multilineText") {
          finalTags = generatedTags.split(",").map((tag) => tag.trim()).join(", ");
        } else {
          finalTags = generatedTags.trim();
        }

        if (!targetFieldName) {
          throw new Error("Target field name could not be determined.");
        }

        await updateRecord({
          baseId: config.baseId,
          tableId: config.tableId,
          recordId: record.id,
          fields: {
            [targetFieldName]: finalTags,
          },
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

    return `Tag generation complete! Processed ${processedCount} records. Updated: ${updatedCount}, Skipped: ${skippedCount}`;
  },
});