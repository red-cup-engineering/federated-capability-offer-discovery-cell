#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
: "${GOOGLE_CLOUD_PROJECT:?set GOOGLE_CLOUD_PROJECT}"

region=${CLOUD_RUN_REGION:-us-central1}
service=${CLOUD_RUN_SERVICE:-federated-capability-offer-discovery-cell}
repository=${ARTIFACT_REPOSITORY:-capability-cells}
image_tag=${IMAGE_TAG:-$(date -u +%Y%m%dT%H%M%SZ)}
runtime_service_account=${CLOUD_RUN_SERVICE_ACCOUNT:-capability-offer-discovery@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com}
data_bucket=${CELL_DATA_BUCKET:-${GOOGLE_CLOUD_PROJECT}-capability-offer-discovery}
activitypub_keys_secret=${ACTIVITYPUB_KEYS_SECRET:-federated-capability-offer-discovery-cell-activitypub-keys}
image_uri=${region}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${repository}/${service}:${image_tag}
timeout=${CLOUD_RUN_TIMEOUT:-900s}
maximum_instances=${CLOUD_RUN_MAX_INSTANCES:-3}

context_dir=$(mktemp -d /tmp/federated-capability-offer-discovery-cell-cloud-build.XXXXXXXX)
cleanup() { rm -rf -- "$context_dir"; }
trap cleanup EXIT
"$script_dir/prepare-context.sh" "$context_dir" >/dev/null

gcloud builds submit "$context_dir" --project "$GOOGLE_CLOUD_PROJECT" \
  --config "$context_dir/cloudbuild.yaml" \
  --substitutions "_IMAGE_URI=$image_uri"

gcloud run deploy "$service" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --region "$region" \
  --image "$image_uri" \
  --service-account "$runtime_service_account" \
  --execution-environment gen2 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances "$maximum_instances" \
  --concurrency 20 \
  --cpu 1 \
  --memory 512Mi \
  --timeout "$timeout" \
  --port 8080 \
  --add-volume "name=cell-data,type=cloud-storage,bucket=$data_bucket,readonly=false" \
  --add-volume-mount "volume=cell-data,mount-path=/var/lib/capability-offer-discovery" \
  --set-env-vars "HOST=0.0.0.0,CAPABILITY_OFFER_DISCOVERY_DATA_ROOT=/var/lib/capability-offer-discovery/settlement,SETTLEMENT_CAIP2=eip155:5615610" \
  --update-secrets "/secrets/activitypub/keys.json=$activitypub_keys_secret:latest" \
  --set-env-vars "ACTIVITYPUB_KEYS_PATH=/secrets/activitypub/keys.json,ACTIVITYPUB_IDENTIFIER=capability-offer-discovery,SETTLEMENT_CAIP2=eip155:5615610"

service_url=$(gcloud run services describe "$service" --project "$GOOGLE_CLOUD_PROJECT" --region "$region" --format='value(status.url)')
gcloud run services update "$service" --project "$GOOGLE_CLOUD_PROJECT" --region "$region" \
  --update-env-vars "BASE_URL=$service_url,ACTIVITYPUB_ORIGIN=$service_url"

printf 'service_url=%s\nimage=%s\n' "$service_url" "$image_uri"
