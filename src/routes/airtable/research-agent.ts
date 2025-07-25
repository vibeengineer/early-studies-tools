import { Action, io, ctx } from "@interval/sdk";
import { generateText } from "ai";
import { getViewRecords, updateRecord } from "../../services/airtable";
import { getModelByKey } from "../../utils/ai-models";
import { selectAirtableBaseConfig, buildFilterFormula } from "../../utils/airtable";
import PQueue from "p-queue";

function generateResearchPrompt({
  sourceData,
  question,
}: {
  sourceData: { [key: string]: unknown };
  question: string;
}) {
  const dataDescription = Object.entries(sourceData)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return `You are a research assistant. Based on the provided data, answer the following research question thoroughly and accurately. Use your knowledge and search capabilities to provide comprehensive insights.

Data Context:
${dataDescription}

Research Question: ${question}

Provide a detailed, well-researched answer:`;
}

export default new Action({
  backgroundable: true,
  name: "Research Agent",
  description: "Generate research-based content for Airtable records using AI",
  handler: async () => {
    // Get shared Airtable configuration
    const config = await selectAirtableBaseConfig();

    const { sourceFields, targetField, researchQuestion, selectedModel, researchDepth, queueConcurrency, queueIntervalCap, queueInterval } = await io
      .group({
        sourceFields: io
          .search("Select Source Fields for Context", {
            helpText: "Search and select fields that will provide context to the AI for research (optional - if none selected, full record will be used)",
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
          helpText: "The field where the research results will be stored",
          options: config.selectedTable.fields.map((field) => ({
            label: field.name,
            value: field.id,
          })),
        }),
        researchQuestion: io.input.text("Research Question/Prompt", {
          helpText: "What do you want the AI to research and write about for each record?",
          placeholder:
            "e.g., Write a brief analysis of this company's market position and competitive advantages",
        }),
        selectedModel: io.select.single("Select AI Model", {
          helpText: "Choose the AI model for research",
          options: [
            {
              label: "Perplexity Sonar",
              value: "sonar",
              description: "Perplexity's fast search-enhanced AI model for real-time information",
            },
            {
              label: "Perplexity Sonar Pro",
              value: "sonar-pro",
              description: "Enhanced version of Sonar with better reasoning and search capabilities",
            },
            {
              label: "Perplexity Sonar Deep Research",
              value: "sonar-deep-research",
              description: "Deep research-focused model for comprehensive information gathering",
            },
          ],
          defaultValue: {
            label: "Perplexity Sonar",
            value: "sonar",
            description: "Perplexity's fast search-enhanced AI model for real-time information",
          },
        }),
        researchDepth: io.select.single("Research Depth", {
          helpText: "How thorough should the research be? (Only applies to Sonar and Sonar Pro models)",
          options: [
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
          ],
          defaultValue: { label: "Medium", value: "medium" },
        }),
        queueConcurrency: io.input.number("Queue Concurrency", {
          helpText: "Number of concurrent requests (optional, defaults to 20)",
          min: 1,
          max: 200,
          placeholder: "20",
        }).optional(),
        queueIntervalCap: io.input.number("Queue Interval Cap", {
          helpText: "Maximum requests per interval (optional, defaults to 10)",
          min: 1,
          max: 50,
          placeholder: "10",
        }).optional(),
        queueInterval: io.input.number("Queue Interval (ms)", {
          helpText: "Interval duration in milliseconds (optional, defaults to 2000)",
          min: 100,
          max: 10000,
          placeholder: "2000",
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
      (f) => f.id === targetField.value
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
    const shouldProceed = await io.confirm(`Generate research for ${records.length} records?`, {
      helpText: `This will modify ${records.length} records in your Airtable. This action cannot be undone.`,
    });

    if (!shouldProceed) {
      return "Action cancelled by user.";
    }

    await ctx.log(`Found ${records.length} records to process`);

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    await ctx.loading.start({
      label: "Researching records...",
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

        const prompt = generateResearchPrompt({
          sourceData,
          question: researchQuestion,
        });

        const selectedModelKey = typeof selectedModel === "string" ? selectedModel : selectedModel.value;
        const { model } = getModelByKey(selectedModelKey);
        
        let result;
        if (selectedModelKey === "sonar-deep-research") {
          result = await generateText({
            model,
            prompt,
          });
        } else {
          result = await generateText({
            model,
            prompt,
            providerOptions: {
              perplexity: {
                web_search_options: {
                  search_context_size: researchDepth.value as "low" | "medium" | "high",
                },
              },
            },
          });
        }

        const researchContent = result.text.trim();

        if (!researchContent) {
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
          fields: {
            [targetFieldName]: researchContent,
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
      concurrency: queueConcurrency || 20, 
      intervalCap: queueIntervalCap || 10, 
      interval: queueInterval || 2000 
    });
    await queue.addAll(tasks);

    return `Research agent complete! Processed ${processedCount} records. Updated: ${updatedCount}, Skipped: ${skippedCount}`;
  },
});
