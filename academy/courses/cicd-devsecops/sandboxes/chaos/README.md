# Sandbox: chaos (LitmusChaos)

Контролируемое внесение хаоса в k3d-кластер для DR-rehearsal и game days.

## Установка

```bash
# в k8s sandbox (см. ../k8s/)
helm repo add litmuschaos https://litmuschaos.github.io/litmus-helm/
helm install litmus litmuschaos/litmus -n litmus --create-namespace
```

## Пример сценария: pod-delete

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata: { name: pod-kill }
spec:
  appinfo: { appns: default, applabel: app=demo, appkind: deployment }
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - { name: TOTAL_CHAOS_DURATION, value: "60" }
            - { name: CHAOS_INTERVAL, value: "10" }
```

## Использование в Lab 30

В rehearsal-пайплайне поднимаем staging, прогоняем pod-delete на API,
проверяем, что SLO держится (HPA скейлит, нет 5xx).

## Reset

```bash
helm uninstall litmus -n litmus
kubectl delete ns litmus
```
