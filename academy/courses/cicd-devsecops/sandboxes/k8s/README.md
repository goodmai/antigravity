# Sandbox: k8s (k3d + ArgoCD + Kyverno + cert-manager)

Локальный k8s-кластер для лаб 03, 09, 10, 14.

## Запуск

```bash
# Кластер
k3d cluster create dev \
  --agents 2 \
  --port "80:80@loadbalancer" \
  --port "443:443@loadbalancer" \
  --k3s-arg "--disable=traefik@server:0"

# Traefik / Ingress NGINX по выбору
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/.../deploy.yaml

# ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Kyverno
helm install kyverno kyverno/kyverno -n kyverno-system --create-namespace

# cert-manager (для mTLS-практик)
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace --set installCRDs=true
```

## Доступы

| Сервис | Команда |
|---|---|
| ArgoCD UI | `kubectl -n argocd port-forward svc/argocd-server 8443:443` → https://localhost:8443 |
| ArgoCD admin password | `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d` |
| Kyverno | через `kubectl describe clusterpolicy` |

## Smoke

```bash
kubectl get nodes
kubectl get pods -A
```

## Reset

```bash
k3d cluster delete dev
```

## Лабы

- [Lab 03 — ARC](../../labs/03-arc/)
- [Lab 09 — k3d deploy](../../labs/09-k3d-deploy/)
- [Lab 10 — Kyverno](../../labs/10-kyverno/)
- [Lab 14 — cosign + Kyverno](../../labs/14-cosign-kyverno/)
