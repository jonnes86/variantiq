# In the runtime section, change:
COPY --from=deps  /app/node_modules ./node_modules
# to:
COPY --from=build /app/node_modules ./node_modules

# And add:
COPY --from=build /app/server.mjs ./server.mjs