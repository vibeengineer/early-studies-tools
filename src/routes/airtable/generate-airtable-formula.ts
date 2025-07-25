import { Action, io } from "@interval/sdk";
import { generateText } from "ai";
import { getBases, getBaseSchema } from "../../services/airtable";
import { o4Mini } from "../../services/ai/providers";

export default new Action({
  name: "Generate Airtable Formula",
  description: "Generate Airtable formulas using natural language",
  handler: async () => {
    const bases = await getBases();
    const base = await io.select.single("Select Airtable Base", {
      options: bases.map((base) => ({
        label: base.name,
        value: base.id,
      })),
    });

    const tables = await getBaseSchema(base.value);
    const table = await io.select.single("Select Table", {
      options: tables.map((table) => ({
        label: table.name,
        value: table.id,
      })),
    });

    const selectedTable = tables.find((item) => item.id === table.value);
    if (!selectedTable) throw new Error("Table not found");

    const { formulaType, description } = await io
      .group({
        formulaType: io.select.single("Formula Type", {
          helpText: "What type of formula do you want to generate?",
          options: [
            { label: "Filter By", value: "filter" },
            { label: "Formula Field", value: "formula" },
            { label: "Rollup Field", value: "rollup" },
            { label: "Automation", value: "automation" },
          ],
        }),
        description: io.input.text("Describe what you want your formula to do", {
          helpText: "Describe in natural language what you want your formula to accomplish",
          placeholder:
            "e.g., Show only records where the status is 'Active' and the date is in the last 30 days",
        }),
      })
      .validate(({ description }) => {
        if (!description.trim()) {
          return "Please provide a description of what you want the formula to do";
        }
      });

    const tableContext = {
      tableName: selectedTable.name,
      fields: selectedTable.fields.map((field) => ({
        name: field.name,
        type: field.type,
        id: field.id,
      })),
    };

    let prompt = `You are an Airtable formula expert. Generate a ${
      formulaType.label
    } formula based on the user's description.

Table Information:
- Table Name: ${tableContext.tableName}
- Fields:
${tableContext.fields.map((field) => `  - ${field.name} (${field.type})`).join("\n")}

User Request: ${description}

Formula Type: ${formulaType.label}

`;

    switch (formulaType.value) {
      case "filter":
        prompt += `Generate a Filter By formula that can be used in Airtable views or API calls. Return ONLY the formula without any explanation or markdown formatting.

Examples:
- {Status} = "Active"
- AND({Date} >= TODAY(), {Status} != "Completed")
- OR({Priority} = "High", {Urgent} = TRUE())

Formula:`;
        break;

      case "formula":
        prompt += `Generate a Formula field formula that can be used in Airtable formula fields. Return ONLY the formula without any explanation or markdown formatting.

Examples:
- IF({Status} = "Complete", "✅", "⏳")
- CONCATENATE({First Name}, " ", {Last Name})
- DATETIME_DIFF({End Date}, {Start Date}, 'days')

Formula:`;
        break;

      case "rollup":
        prompt += `Generate a Rollup field formula that aggregates data from linked records. Return ONLY the formula without any explanation or markdown formatting.

Examples:
- SUM(values)
- COUNT(values)
- CONCATENATE(values, ", ")
- MAX(values)

Formula:`;
        break;

      case "automation":
        prompt += `Generate an Automation condition formula that can be used in Airtable automations. Return ONLY the formula without any explanation or markdown formatting.

Examples:
- {Status} = "New"
- AND({Priority} = "High", {Assigned To} != BLANK())
- OR({Due Date} < TODAY(), {Status} = "Overdue")

Formula:`;
        break;
    }

    const result = await generateText({
      model: o4Mini,
      prompt,
    });

    const formula = result.text.trim();
    console.log(result.usage);

    await io.display.markdown(`## Generated ${formulaType.label} Formula

\`\`\`
${formula}
\`\`\`

### How to use this formula:

${
  formulaType.value === "filter"
    ? "Copy this formula and paste it into the 'Filter By Formula' field in your Airtable view or API request."
    : formulaType.value === "formula"
    ? "Create a new Formula field in your table and paste this formula into the formula editor."
    : formulaType.value === "rollup"
    ? "Create a new Rollup field in your table and paste this formula into the aggregation formula editor."
    : "Use this formula as a condition in your Airtable automation trigger or action."
}

### Table Context:
- **Table:** ${selectedTable.name}
- **Available Fields:** ${selectedTable.fields.map((f) => f.name).join(", ")}`);

    return formula;
  },
});
