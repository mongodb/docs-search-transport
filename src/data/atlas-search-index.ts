import { IndexMappings } from "./atlas-types"

export const SearchIndex:IndexMappings = {
  "mappings": {
    "dynamic": false,
    "fields": {
      "code": {
        "fields": {
          "lang": [
            {
              "dynamic": true,
              "type": "document"
            },
            {
              "type": "string"
            }
          ],
          "value": [
            {
              "dynamic": true,
              "type": "document"
            },
            {
              "analyzer": "lucene.whitespace",
              "multi": {
                "simple": {
                  "analyzer": "lucene.simple",
                  "store": false,
                  "type": "string"
                }
              },
              "searchAnalyzer": "lucene.whitespace",
              "type": "string"
            }
          ]
        },
        "type": "document"
      },
      "headings": {
        "analyzer": "lucene.english",
        "multi": {
          "whitespace": {
            "analyzer": "custom.whitespace",
            "store": false,
            "type": "string"
          }
        },
        "searchAnalyzer": "lucene.english",
        "store": false,
        "type": "string"
      },
      "paragraphs": {
        "analyzer": "lucene.english",
        "searchAnalyzer": "lucene.english",
        "type": "string"
      },
      "tags": {
        "analyzer": "lucene.english",
        "indexOptions": "freqs",
        "searchAnalyzer": "lucene.english",
        "store": false,
        "type": "string"
      },
      "text": {
        "type": "string"
      },
      "title": {
        "analyzer": "lucene.english",
        "multi": {
          "whitespace": {
            "analyzer": "custom.whitespace",
            "store": false,
            "type": "string"
          }
        },
        "searchAnalyzer": "lucene.english",
        "store": false,
        "type": "string"
      }
    }
  },
  "analyzers": [
    {
      "charFilters": [],
      "name": "custom.whitespace",
      "tokenFilters": [
        {
          "matches": "all",
          "pattern": "^(?!\\$)\\w+",
          "replacement": "",
          "type": "regex"
        }
      ],
      "tokenizer": {
        "type": "whitespace"
      }
    }
  ]
}