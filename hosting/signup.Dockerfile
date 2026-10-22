# The public sign-up page only (#1091): two files, no packages.
FROM node:24-slim
WORKDIR /app
COPY provisioner/public.mjs provisioner/lifecycle.mjs ./
USER node
EXPOSE 8200
CMD ["node", "public.mjs"]
