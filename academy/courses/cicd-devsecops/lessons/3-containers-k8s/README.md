# Module 3 — Containers, K8s, Pods

> Docker правильно (distroless multi-stage), BuildKit/buildx/kaniko с
> SBOM/provenance, Kubernetes: Pod/Deployment/Service/Ingress/HPA, Helm vs
> Kustomize, Pod Security Standards и Kyverno-политики.

---

## 3.1 · Docker правильно

**Канон:** [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/),
[distroless](https://github.com/GoogleContainerTools/distroless),
[OCI Image Spec](https://github.com/opencontainers/image-spec),
[reproducible-builds.org](https://reproducible-builds.org).

**4 правила «взрослого» Dockerfile:**

1. Multi-stage (builder отдельно, runtime отдельно).
2. **Distroless** / `scratch` для runtime — никаких shells, package managers.
3. `USER` ≠ root, `runAsNonRoot=true` в k8s — не выполнится, если есть root.
4. `LABEL org.opencontainers.image.*` + SBOM/provenance attestations.

```dockerfile
# syntax=docker/dockerfile:1.7
ARG GO_VERSION=1.23
ARG ALPINE_VERSION=3.20

# ---- builder ----
FROM golang:${GO_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux GOFLAGS="-trimpath" \
    go build -ldflags="-s -w -buildid=" -o /out/app ./cmd/app

# ---- runtime ----
FROM gcr.io/distroless/static-debian12:nonroot
USER 65532:65532
COPY --from=builder /out/app /app
ENTRYPOINT ["/app"]

LABEL org.opencontainers.image.source="https://github.com/me/app" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.revision="$GIT_SHA" \
      org.opencontainers.image.version="$VERSION"
```

**Почему `distroless/static-debian12`:** ни `sh`, ни `apt`, ни `curl`, ни glibc —
поверхность атаки минимальна. Если совсем минимум — `FROM scratch` для Go
(требует `CGO_ENABLED=0`).

**`.dockerignore` — не забываем:**

```
.git
node_modules
*.md
.env*
**/dist
**/build
**/.terraform
```

Иначе вы случайно отправите `.env` в контекст и попадёте в layer. (А слой
останется в registry, даже если потом удалить файл.)

**Лаба 08** — образ Go-сервиса < 30 МБ + scratch + non-root, в CI собрался
с BuildKit-кэшем.

---

## 3.2 · BuildKit / buildx / kaniko

**Канон:** [BuildKit docs](https://docs.docker.com/build/buildkit/),
[buildx](https://github.com/docker/buildx), [kaniko](https://github.com/GoogleContainerTools/kaniko),
[SLSA attestations in BuildKit](https://docs.docker.com/build/attestations/).

**buildx + QEMU** — мульти-арх (`linux/amd64,linux/arm64`) на одном x86-раннере.

```yaml
- uses: docker/setup-qemu-action@SHA
- uses: docker/setup-buildx-action@SHA
- uses: docker/build-push-action@SHA
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: ghcr.io/me/app:${{ github.sha }}
    provenance: mode=max     # SLSA-провенанс в манифесте
    sbom: true               # CycloneDX SBOM в registry
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`provenance=mode=max` — кладёт в registry **attestation**: какой commit, какой
runner, какие build args. Verify через `cosign verify-attestation`.

**kaniko** — собирает образы **внутри** k8s-кластера без Docker socket. Безопаснее
для shared runner'ов.

---

## 3.3 · Kubernetes: Pod, Deployment, Service, Ingress

**Канон:** [Kubernetes docs](https://kubernetes.io/docs/concepts/),
[Production-Grade Container Orchestration](https://kubernetes.io/docs/setup/best-practices/),
[k8s patterns book](https://k8spatterns.io).

**Архитектура объектов:**

```
Deployment ──► ReplicaSet ──► Pod (1..N containers)
                                │
                                ├── probes (liveness/readiness/startup)
                                ├── resources (requests/limits)
                                └── securityContext (runAsNonRoot, RO-fs)
Service (ClusterIP/NodePort/LB) ──► Endpoints ──► Pods
Ingress ──► Service ──► Pods
HPA (CPU/memory/custom) ──► Deployment
PDB (PodDisruptionBudget) — защита от voluntary disruptions
```

**Минимальный production-ready Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }     # zero-downtime
  selector: { matchLabels: { app: app } }
  template:
    metadata: { labels: { app: app } }
    spec:
      automountServiceAccountToken: false                  # минимум привилегий
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        fsGroup: 65532
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: app
          image: ghcr.io/me/app@sha256:abc...              # digest, не tag!
          imagePullPolicy: IfNotPresent
          ports: [{ containerPort: 8080, name: http }]
          resources:
            requests: { cpu: 100m, memory: 128Mi }
            limits:   { cpu: 500m, memory: 256Mi }
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /health/live, port: http }
            initialDelaySeconds: 30
          startupProbe:
            httpGet: { path: /health/live, port: http }
            failureThreshold: 30
            periodSeconds: 5
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ "ALL" ] }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes: [{ name: tmp, emptyDir: {} }]
---
apiVersion: v1
kind: Service
metadata: { name: app }
spec:
  selector: { app: app }
  ports: [{ name: http, port: 80, targetPort: http }]
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: app }
spec:
  minAvailable: 2
  selector: { matchLabels: { app: app } }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: app }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: app }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
```

**Почему это важно построчно:**

- `image: ...@sha256:...` — digest гарантирует **тот же** образ, что был на ревью.
  Tag — мутабельный, атакующий может перепушить.
- `readOnlyRootFilesystem: true` — exploit не запишет webshell.
- `automountServiceAccountToken: false` — Pod не должен ходить в kube-API
  без явной нужды.
- `PDB` — не даст drain-у выкосить все реплики разом.
- HPA — реакция на нагрузку, иначе SLO деградирует.

**Лаба 09** — k3d-кластер, деплой с HPA, Ingress через Traefik/NGINX,
zero-downtime rolling update.

---

## 3.4 · Helm vs Kustomize

**Канон:** [Helm best practices](https://helm.sh/docs/chart_best_practices/),
[Kustomize official docs](https://kustomize.io),
[ArgoCD Helm/Kustomize integration](https://argo-cd.readthedocs.io).

| | Helm | Kustomize |
|---|---|---|
| Концепция | template + values | overlays + patches |
| Сложность | выше (Go templates, _helpers.tpl) | ниже (чистый YAML) |
| Версии | charts + dependencies | git-tag |
| Best for | дистрибутив (oss-чарт) | внутренний моно-репо |
| Подводный камень | string templating → bugs | overlays-дерево становится сложным |

**Совет:** Helm — когда вы **публикуете** чарт для других. Kustomize — для
**своего** монорепо с env-overlays (`base`, `overlays/dev`, `overlays/prod`).

Современный паттерн: Helm-чарт (от vendor) + Kustomize-патчи поверх (`kustomize`
теперь поддерживает inflateHelmChart). Лучшее из двух миров.

---

## 3.5 · Pod-security: Kyverno/Gatekeeper, NetworkPolicies

**Канон:** [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/),
[Kyverno docs](https://kyverno.io/docs/), [OPA Gatekeeper](https://open-policy-agent.github.io/gatekeeper/),
[CNCF Cloud Native Security Whitepaper](https://github.com/cncf/tag-security).

**Pod Security Standards (PSS)** — три профиля:

| | Privileged | Baseline | **Restricted** |
|---|---|---|---|
| Host namespaces | ✓ | ✗ | ✗ |
| Root container | ✓ | ✓ | ✗ |
| Capabilities | all | drop required | drop ALL except NET_BIND_SERVICE |
| Seccomp | optional | optional | required (RuntimeDefault) |
| `readOnlyRootFs` | optional | optional | **required** |

В prod всегда **Restricted**. Применяется через PSA (built-in admission):

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: prod
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### Kyverno-политика: только подписанные образы

```yaml
apiVersion: kyverno.io/v2beta1
kind: ClusterPolicy
metadata: { name: verify-signed-images }
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-signature
      match: { any: [{ resources: { kinds: [Pod] } }] }
      verifyImages:
        - imageReferences: [ "ghcr.io/me/*" ]
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/me/app/.github/workflows/release.yml@refs/tags/*"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor: { url: https://rekor.sigstore.dev }
```

**Что это делает:** не пустит в кластер ни один образ, который не подписан
cosign'ом из вашего GH Actions workflow. Это **closes the loop** между Module 4
(cosign-подпись) и runtime.

### NetworkPolicy: default-deny

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: prod }
spec:
  podSelector: {}            # все Pod'ы namespace
  policyTypes: [Ingress, Egress]
# egress/ingress пусто = всё запрещено
```

Дальше — точечно разрешаем нужные потоки. Без `default-deny` любой
compromised Pod может ходить куда угодно внутри кластера.

**Лаба 10** — Kyverno-политики блокируют небезопасный Pod (root, latest, no signature).

---

## Чек-лист модуля

- [ ] Все образы — multi-stage, distroless / scratch, non-root.
- [ ] BuildKit с `provenance=mode=max` + `sbom: true`.
- [ ] В Deployment: digest вместо tag, `readOnlyRootFs`, `runAsNonRoot`,
      seccomp `RuntimeDefault`, drop ALL caps, probes, resources, PDB, HPA.
- [ ] Namespace помечен PSA `enforce=restricted`.
- [ ] Kyverno-политика проверяет cosign-подпись.
- [ ] NetworkPolicy `default-deny` в каждом namespace.

## Лабы модуля

- [Lab 08 — Distroless образ < 30 МБ](../../labs/08-distroless/)
- [Lab 09 — K3d + HPA + Ingress](../../labs/09-k3d-deploy/)
- [Lab 10 — Kyverno-политики](../../labs/10-kyverno/)
