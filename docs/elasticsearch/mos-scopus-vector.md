{
  "mos-scopus-vector-0.0.5": {
    "aliases": {
      "mos-scopus-vector": {},
      "mos-scopus-vector-0.0.1": {}
    },
    "mappings": {
      "properties": {
        "abstract": {
          "type": "text",
          "analyzer": "ripp_standard"
        },
        "authors": {
          "properties": {
            "auid": {
              "type": "keyword"
            },
            "familyName": {
              "type": "text",
              "fields": {
                "keyword": {
                  "type": "keyword",
                  "ignore_above": 256
                }
              }
            },
            "givenName": {
              "type": "text",
              "analyzer": "ripp_standard"
            },
            "initials": {
              "type": "text",
              "fields": {
                "keyword": {
                  "type": "keyword",
                  "ignore_above": 256
                }
              }
            }
          }
        },
        "citationType": {
          "type": "keyword"
        },
        "citations": {
          "type": "long"
        },
        "country": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "created_at": {
          "type": "date"
        },
        "db": {
          "type": "keyword"
        },
        "doi": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "id": {
          "type": "keyword"
        },
        "identifier": {
          "type": "keyword"
        },
        "isAbstractPresent": {
          "type": "boolean"
        },
        "isPiiPresent": {
          "type": "boolean"
        },
        "issn": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "issueDateText": {
          "type": "text"
        },
        "issueDay": {
          "type": "text"
        },
        "issueEndPage": {
          "type": "text"
        },
        "issueMonth": {
          "type": "text"
        },
        "issueStartPage": {
          "type": "text"
        },
        "issueVolume": {
          "type": "text"
        },
        "issueYear": {
          "type": "text"
        },
        "journalTitle": {
          "type": "text"
        },
        "jstageid": {
          "type": "keyword"
        },
        "keywords": {
          "type": "text",
          "analyzer": "ripp_standard"
        },
        "name": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "orgs": {
          "properties": {
            "id": {
              "type": "keyword"
            },
            "name": {
              "type": "text",
              "analyzer": "ripp_standard"
            }
          }
        },
        "pii": {
          "type": "keyword"
        },
        "publicationYear": {
          "type": "integer"
        },
        "sgrid": {
          "type": "keyword"
        },
        "sourceId": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "sourceTitle": {
          "type": "text",
          "fields": {
            "keyword": {
              "type": "keyword",
              "ignore_above": 256
            }
          }
        },
        "title": {
          "type": "text",
          "analyzer": "ripp_standard"
        },
        "type": {
          "type": "keyword"
        },
        "updated_at": {
          "type": "date"
        },
        "user": {
          "type": "keyword"
        },
        "vectors": {
          "type": "dense_vector",
          "dims": 384,
          "index": true,
          "similarity": "cosine",
          "index_options": {
            "type": "int8_hnsw",
            "m": 16,
            "ef_construction": 100
          }
        }
      }
    },
    "settings": {
      "index": {
        "routing": {
          "allocation": {
            "include": {
              "_tier_preference": "data_content"
            }
          }
        },
        "refresh_interval": "1s",
        "number_of_shards": "10",
        "provided_name": "mos-scopus-vector-0.0.5",
        "merge": {
          "scheduler": {
            "max_thread_count": "3",
            "max_merge_count": "3"
          }
        },
        "creation_date": "1776936878844",
        "store": {
          "preload": [
            "nvd",
            "vex",
            "vec",
            "vem"
          ]
        },
        "analysis": {
          "analyzer": {
            "ripp_standard": {
              "filter": [
                "lowercase",
                "asciifolding",
                "porter_stem"
              ],
              "type": "custom",
              "tokenizer": "standard"
            }
          }
        },
        "number_of_replicas": "0",
        "uuid": "BUWwFXFRR8mkdDemUj8bRA",
        "version": {
          "created": "9009000"
        }
      }
    }
  }
}