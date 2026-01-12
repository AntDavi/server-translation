import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// Azure Translator Credentials
const ENDPOINT = process.env.AZURE_API_ENDPOINT || "";
const KEY = process.env.AZURE_API_KEY || "";
const REGION = process.env.AZURE_REGION || "";

export async function translate(
  text: string,
  from: string,
  to: string
): Promise<string> {
  // Se for a mesma língua, retorna o texto original
  if (from === to) return text;

  try {
    const response = await axios({
      baseURL: ENDPOINT,
      url: "/translate",
      method: "post",
      headers: {
        "Ocp-Apim-Subscription-Key": KEY,
        "Ocp-Apim-Subscription-Region": REGION,
        "Content-type": "application/json",
      },
      params: {
        "api-version": "3.0",
        from: from,
        to: to,
      },
      data: [
        {
          text: text,
        },
      ],
      responseType: "json",
    });

    if (
      response.data &&
      response.data[0] &&
      response.data[0].translations &&
      response.data[0].translations[0]
    ) {
      return response.data[0].translations[0].text;
    }

    throw new Error("Invalid response from Azure Translator API");
  } catch (error: any) {
    if (error.response) {
      console.error(
        "Translation API Error:",
        error.response.status,
        JSON.stringify(error.response.data)
      );
    } else {
      console.error("Translation error:", error.message);
    }
    // Fallback: retorna o texto original em caso de erro
    return text;
  }
}
