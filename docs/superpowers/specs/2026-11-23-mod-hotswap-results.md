# Mod hotswap: manual in-game test results (tier 0)

The agent was built and unit-tested without launching Minecraft. Every item below
needs a maintainer run with hotswap turned on for the instance.

Test instances: Fabric 1.20.1, Fabric 1.21.1, NeoForge 1.21.1, Forge 1.20.1.

For each instance, publish a pack that changes one texture inside a resource pack and one config file, then:

| Check | Fabric 1.20.1 | Fabric 1.21.1 | NeoForge 1.21.1 | Forge 1.20.1 |
|---|---|---|---|---|
| Prompt appears at the main menu | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer |
| Apply: texture changes without a restart | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer |
| `result.json` shows `applied`, then `healthy` | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer |
| Publish a mod-jar change: "Restart to apply" is shown; the next launch has the new jar | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer | PENDING — manual run by maintainer |

Compatibility:

- Launch the same instance with the current released launcher: it behaves as today. PENDING — manual run by maintainer
