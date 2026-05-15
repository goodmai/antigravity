# Sandbox: cloud-lite

Имитация AWS / Azure / GCP API без счёта. Используется в лабах 23, 24.

## Запуск

```bash
docker compose up -d
```

## Smoke

```bash
# AWS S3 через LocalStack
aws --endpoint-url http://localhost:4566 s3 mb s3://demo
aws --endpoint-url http://localhost:4566 s3 ls

# Azurite (Azure Blob)
az storage container create --name demo \
  --connection-string "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://localhost:10000/devstoreaccount1;"

# fake-gcs
curl -X POST http://localhost:4443/storage/v1/b -H "Content-Type: application/json" -d '{"name":"demo"}'
```

## Лабы

- [Lab 23 — GH→AWS через OIDC](../../labs/23-aws-oidc/) — флоу OIDC через
  LocalStack (через `awslocal` + custom STS-endpoint).
- [Lab 24 — Terraform + Atlantis + tfsec](../../labs/24-terraform-atlantis/) —
  PR-driven flow с auto-plan.

## Reset

```bash
docker compose down -v
```
