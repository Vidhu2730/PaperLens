{
  "mos-sd-fulltext-v1.0": {
    "aliases": {
      "mos-sd-fulltext": {}
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "fulltext": {
          "type": "text",
          "index": false
        },
        "pii": {
          "type": "keyword"
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
        "number_of_shards": "1",
        "blocks": {
          "write": "false"
        },
        "provided_name": "mos-sd-fulltext-v1.0",
        "creation_date": "1748247205932",
        "number_of_replicas": "0",
        "uuid": "HwK9WKs_Tu-By7JXjlOqxQ",
        "version": {
          "created": "8090099"
        }
      }
    }
  }
}