# Deploying to AWS / GCP / Azure

All three work the same way — run our Docker container.

## AWS (Elastic Container Service)
1. Push image to ECR:
   docker build -t ai-scheduler .
   aws ecr create-repository --repository-name ai-scheduler
   docker tag ai-scheduler:latest <your-ecr-url>/ai-scheduler:latest
   docker push <your-ecr-url>/ai-scheduler:latest
2. Create ECS task with env var: ENCRYPTION_SECRET=your_secret
3. Mount EFS volume to /app/data for persistent storage
4. Create ALB for HTTPS access

## Google Cloud Run
gcloud run deploy ai-scheduler \
  --source . \
  --set-env-vars ENCRYPTION_SECRET=your_secret \
  --platform managed \
  --allow-unauthenticated
# Note: Cloud Run is stateless — mount Cloud Filestore or use Cloud SQL for /app/data

## Azure Container Apps
az containerapp create \
  --name ai-scheduler \
  --environment your-env \
  --image your-registry/ai-scheduler \
  --env-vars ENCRYPTION_SECRET=your_secret \
  --target-port 3000
# Mount Azure File Share to /app/data for persistence
