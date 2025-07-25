import { Action, io, ctx } from "@interval/sdk";
import { getViewRecords, updateRecord } from "../../services/airtable";
import { scrapeLinkedinProfile } from "../../services/apify/scrape-linkedin-profile";
import { scrapeLinkedinPosts } from "../../services/apify/scrape-linkedin-posts";
import { selectAirtableBaseConfig, buildFilterFormula } from "../../utils/airtable";
import PQueue from "p-queue";

export default new Action({
  backgroundable: true,
  name: "LinkedIn Scraper",
  description: "Scrape LinkedIn profiles and store the data in Airtable",
  handler: async () => {
    // Get shared Airtable configuration
    const config = await selectAirtableBaseConfig();

    const {
      sourceField,
      targetField,
      scrapeType,
      queueConcurrency,
      queueIntervalCap,
      queueInterval,
    } = await io
      .group({
        sourceField: io.select.single("Select LinkedIn URL Field", {
          helpText: "The field containing LinkedIn profile URLs",
          options: config.selectedTable.fields.map((field) => ({
            label: field.name,
            value: field.id,
          })),
        }),
        targetField: io.select.single("Select Target Field", {
          helpText: "The field where scraped LinkedIn data will be stored",
          options: config.selectedTable.fields.map((field) => ({
            label: field.name,
            value: field.id,
          })),
        }),
        scrapeType: io.select.single("Select Scrape Type", {
          helpText: "Choose what to scrape from LinkedIn",
          options: [
            {
              label: "Profile Data",
              value: "profile",
              description: "Scrape complete LinkedIn profile information",
            },
            {
              label: "Recent Posts",
              value: "posts",
              description: "Scrape recent posts from the LinkedIn profile",
            },
          ],
          defaultValue: {
            label: "Profile Data",
            value: "profile",
            description: "Scrape complete LinkedIn profile information",
          },
        }),
        queueConcurrency: io.input.number("Queue Concurrency", {
          helpText: "Number of concurrent requests (optional, defaults to 2)",
          min: 1,
          max: 32,
          placeholder: "2",
        }).optional(),
        queueIntervalCap: io.input.number("Queue Interval Cap", {
          helpText: "Maximum requests per interval (optional, defaults to 1)",
          min: 1,
          max: 25,
          placeholder: "1",
        }).optional(),
        queueInterval: io.input.number("Queue Interval (ms)", {
          helpText: "Interval duration in milliseconds (optional, defaults to 5000)",
          min: 1000,
          max: 30000,
          placeholder: "5000",
        }).optional(),
      })
      .validate(({ sourceField, targetField }) => {
        const sourceFieldObj = config.selectedTable.fields.find((f) => f.id === sourceField.value);
        const targetFieldObj = config.selectedTable.fields.find((f) => f.id === targetField.value);

        if (
          !sourceFieldObj ||
          (sourceFieldObj.type !== "url" &&
            sourceFieldObj.type !== "singleLineText" &&
            sourceFieldObj.type !== "multilineText")
        ) {
          return "Source field must be a URL, Single Line Text, or Multiple Line Text field type";
        }

        if (
          !targetFieldObj ||
          (targetFieldObj.type !== "singleLineText" &&
            targetFieldObj.type !== "multilineText" &&
            targetFieldObj.type !== "richText")
        ) {
          return "Target field must be a Single Line Text, Multiple Line Text, or Rich Text field type";
        }
      });

    const sourceFieldName = config.selectedTable.fields.find(
      (f) => f.id === sourceField.value
    )?.name;

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

    const scrapeTypeValue = typeof scrapeType === "string" ? scrapeType : scrapeType.value;
    const scrapeTypeLabel = scrapeTypeValue === "posts" ? "posts" : "profiles";
    
    // Confirm before processing
    const shouldProceed = await io.confirm(`Scrape LinkedIn ${scrapeTypeLabel} for ${records.length} records?`, {
      helpText: `This will modify ${records.length} records in your Airtable and make API calls to scrape LinkedIn ${scrapeTypeLabel}. This action cannot be undone.`,
    });

    if (!shouldProceed) {
      return "Action cancelled by user.";
    }

    await ctx.log(`Found ${records.length} records to process`);

    let processedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    await ctx.loading.start({
      label: "Scraping LinkedIn profiles...",
      itemsInQueue: records.length,
    });

    const tasks = records.map((record) => async () => {
      try {
        if (!sourceFieldName || !targetFieldName) {
          throw new Error("Field names could not be determined.");
        }

        const linkedinUrl = record.fields[sourceFieldName] as string;

        if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) {
          skippedCount++;
          await ctx.log(`Skipped record ${record.id}: No valid LinkedIn URL found`);
          return;
        }

        const scrapeTypeValue = typeof scrapeType === "string" ? scrapeType : scrapeType.value;
        
        let scrapedData;
        if (scrapeTypeValue === "posts") {
          scrapedData = await scrapeLinkedinPosts(linkedinUrl);
        } else {
          scrapedData = await scrapeLinkedinProfile(linkedinUrl);
        }
        const stringifiedData = JSON.stringify(scrapedData, null, 2);

        await updateRecord({
          baseId: config.baseId,
          tableId: config.tableId,
          recordId: record.id,
          fields: { [targetFieldName]: stringifiedData },
        });

        updatedCount++;
        await ctx.log(`Updated record ${++processedCount}/${records.length}: ${record.id}`);
        await ctx.loading.completeOne();
      } catch (error) {
        skippedCount++;
        await ctx.log(`Error processing record ${record.id}: ${error}`);
        await ctx.loading.completeOne();
      }
    });

    const queue = new PQueue({
      concurrency: queueConcurrency || 2,
      intervalCap: queueIntervalCap || 1,
      interval: queueInterval || 5000
    });
    await queue.addAll(tasks);

    return `LinkedIn scraping complete! Processed ${processedCount} records. Updated: ${updatedCount}, Skipped: ${skippedCount}`;
  },
});