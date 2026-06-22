# CinéMath Native — M1a: Offline Catalog Browse + Local Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Kotlin Multiplatform skeleton and ship a phone app that browses the 24 bundled catalogs and records status / rating / reaction-tags locally — fully offline, zero network.

**Architecture:** Fat `:shared` (KMP commonMain) holds domain models, a validated catalog loader, a SQLDelight cache, repositories, and MVI ViewModels exposing `StateFlow`. `:app-phone` is a thin Compose Material3 layer. No networking, no pairing, no sync in M1a — those are M1b. Catalogs ship as bundled app assets and seed SQLDelight on first run.

**Tech Stack:** Kotlin Multiplatform, Gradle (KMP plugin + version catalog), SQLDelight, kotlinx.serialization, Koin, Coroutines/Flow, Jetpack Compose Material3, JUnit + kotlin.test.

## Global Constraints

- **Module layout (spec §2):** `:shared` (commonMain + androidMain + commonTest), `:app-phone`. `:app-tv` / `:app-ios` are NOT created in M1a.
- **Package root:** `com.cinemath` (shared: `com.cinemath.shared`; phone app: `com.cinemath.phone`).
- **Android applicationId:** `com.cinemath.phone` (distinct from the legacy TWA `com.watchtrack.tv` — do not collide).
- **minSdk = 26, targetSdk = 34, compileSdk = 34, JDK 17.**
- **Catalog data is the source of truth (spec §2 "What stays untouched"):** the 24 `/data/*.json` files are copied verbatim into `:app-phone` assets. Do NOT hand-edit catalog content.
- **Item-state storage key = `"tab:itemId"` (spec §4.1)** where `itemId` is the catalog item's stable slug.
- **Reaction tags are open-ended validated strings, NOT a sealed enum.** (Deviation from spec §4.1 — see "Deviations" below. The production blob in `app.js` uses per-catalog free-text tags like `"Score is the engine"`.)
- **Status and Rating ARE closed sealed/enum vocabularies** with lenient parsing: unknown serialized values degrade to `UNSET`/`UNRATED`, never throw (spec §7 "bad data ... skipped + logged, not a silent crash").
- **TDD:** every behavioral task writes the failing test first. Commit after each green task.

### Deviations from spec (decided during planning)

1. **Reaction tags = `List<String>`**, not a sealed enum. The spec §4.1 listed reaction-tag values among "sealed enums", but the live `app.js` blob shows open-ended, per-catalog vocabularies (musicals use `"Score is the engine"`, thrillers use `"Smart structure"`). A closed enum would reject real data. Status/Rating remain sealed (genuinely closed vocabularies).
2. **M1a writes are local-only — no `/sync/put`.** The Worker's `/sync/put` stores the blob *verbatim* with no server-side merge (`worker/worker.js:1586`); the merge is client-side. Pushing from a half-migrated native app would clobber the still-running PWA's state. M1a therefore never pushes. Pull + client-side merge + push all land in M1b/M5.
3. **Catalogs bundled as assets in M1a** (offline by design). Remote etag-refresh from GitHub Pages (`catalog_cache.etag`/`fetched_at`) lands in M1b with the network layer; the columns exist now but `etag` is `NULL` and `fetched_at` is the seed time until then.

---

### Task 1: KMP project scaffold

Stand up a buildable, empty multi-module KMP project. No app logic yet — this task's deliverable is "`./gradlew :app-phone:assembleDebug` produces an APK that launches to a blank screen."

**Files:**
- Create: `cinemath-native/settings.gradle.kts`
- Create: `cinemath-native/build.gradle.kts`
- Create: `cinemath-native/gradle/libs.versions.toml`
- Create: `cinemath-native/gradle.properties`
- Create: `cinemath-native/shared/build.gradle.kts`
- Create: `cinemath-native/app-phone/build.gradle.kts`
- Create: `cinemath-native/app-phone/src/androidMain/AndroidManifest.xml`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/.gitkeep`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `:shared` and `:app-phone` Gradle modules and the `libs` version catalog every later task references.

- [ ] **Step 1: Create the version catalog**

`cinemath-native/gradle/libs.versions.toml`:

```toml
[versions]
kotlin = "2.0.21"
agp = "8.5.2"
sqldelight = "2.0.2"
koin = "3.5.6"
coroutines = "1.9.0"
serialization = "1.7.3"
compose-bom = "2024.09.03"
androidx-activity = "1.9.2"
androidx-core = "1.13.1"
androidx-lifecycle = "2.8.6"
androidx-navigation = "2.8.2"

[libraries]
sqldelight-android = { module = "app.cash.sqldelight:android-driver", version.ref = "sqldelight" }
sqldelight-runtime = { module = "app.cash.sqldelight:runtime", version.ref = "sqldelight" }
sqldelight-coroutines = { module = "app.cash.sqldelight:coroutines-extensions", version.ref = "sqldelight" }
sqldelight-sqlite-driver = { module = "app.cash.sqldelight:sqlite-driver", version.ref = "sqldelight" }
koin-core = { module = "io.insert-koin:koin-core", version.ref = "koin" }
koin-android = { module = "io.insert-koin:koin-android", version.ref = "koin" }
kotlinx-coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "androidx-activity" }
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "androidx-core" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "androidx-lifecycle" }
androidx-navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "androidx-navigation" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "compose-bom" }
compose-material3 = { module = "androidx.compose.material3:material3" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }

[plugins]
kotlin-multiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
sqldelight = { id = "app.cash.sqldelight", version.ref = "sqldelight" }
compose-compiler = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
```

- [ ] **Step 2: Create settings + root build + gradle.properties**

`cinemath-native/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "cinemath-native"
include(":shared", ":app-phone")
```

`cinemath-native/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.kotlin.multiplatform) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.sqldelight) apply false
    alias(libs.plugins.compose.compiler) apply false
}
```

`cinemath-native/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
kotlin.code.style=official
android.useAndroidX=true
android.nonTransitiveRClass=true
```

- [ ] **Step 3: Create the `:shared` module build file**

`cinemath-native/shared/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.sqldelight)
}

kotlin {
    androidTarget()
    sourceSets {
        commonMain.dependencies {
            implementation(libs.kotlinx.coroutines.core)
            implementation(libs.kotlinx.serialization.json)
            implementation(libs.koin.core)
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.coroutines)
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation(libs.kotlinx.coroutines.test)
            implementation(libs.sqldelight.sqlite.driver)
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android)
            implementation(libs.koin.android)
        }
    }
}

android {
    namespace = "com.cinemath.shared"
    compileSdk = 34
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

sqldelight {
    databases {
        create("CineMathDb") {
            packageName.set("com.cinemath.shared.db")
        }
    }
}
```

- [ ] **Step 4: Create the `:app-phone` module build file + manifest**

`cinemath-native/app-phone/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.compose.compiler)
}

kotlin {
    androidTarget()
    sourceSets {
        androidMain.dependencies {
            implementation(project(":shared"))
            implementation(libs.androidx.core.ktx)
            implementation(libs.androidx.activity.compose)
            implementation(libs.androidx.lifecycle.viewmodel.compose)
            implementation(libs.androidx.navigation.compose)
            implementation(libs.koin.android)
            implementation(platform(libs.compose.bom))
            implementation(libs.compose.material3)
            implementation(libs.compose.ui)
            implementation(libs.compose.ui.tooling.preview)
            debugImplementation(libs.compose.ui.tooling)
        }
    }
}

android {
    namespace = "com.cinemath.phone"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.cinemath.phone"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0-m1a"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    dependencies {
        androidTestImplementation(platform(libs.compose.bom))
        androidTestImplementation(libs.compose.ui.test.junit4)
        debugImplementation(libs.compose.ui.test.manifest)
    }
}
```

`cinemath-native/app-phone/src/androidMain/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="CinéMath"
        android:theme="@android:style/Theme.Material.NoActionBar"
        android:supportsRtl="true">
        <activity
            android:name="com.cinemath.phone.MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 5: Create a placeholder MainActivity so the module compiles**

`cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/MainActivity.kt`:

```kotlin
package com.cinemath.phone

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Text("CinéMath M1a") }
    }
}
```

- [ ] **Step 6: Verify it builds**

Run: `cd cinemath-native && ./gradlew :app-phone:assembleDebug`
Expected: `BUILD SUCCESSFUL`, an APK at `app-phone/build/outputs/apk/debug/app-phone-debug.apk`.

- [ ] **Step 7: Commit**

```bash
git add cinemath-native
git commit -m "chore(native): scaffold KMP project (:shared + :app-phone)"
```

---

### Task 2: Status & Rating sealed enums

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/domain/WatchStatus.kt`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/domain/Rating.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/domain/EnumParsingTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `enum class WatchStatus { UNSET, QUEUED, WATCHING, WATCHED, SKIPPED }` with `val wire: String?` and `companion object { fun fromWire(s: String?): WatchStatus }`.
  - `enum class Rating { UNRATED, LIKED, LOVED, DISLIKED }` with `val wire: String?`, `val score: Int` (LOVED=2, LIKED=1, else 0 — feeds the recs engine in M2), and `companion object { fun fromWire(s: String?): Rating }`.

- [ ] **Step 1: Write the failing test**

`EnumParsingTest.kt`:

```kotlin
package com.cinemath.shared.domain

import kotlin.test.Test
import kotlin.test.assertEquals

class EnumParsingTest {
    @Test fun status_parses_known_wire_values() {
        assertEquals(WatchStatus.WATCHED, WatchStatus.fromWire("watched"))
        assertEquals(WatchStatus.QUEUED, WatchStatus.fromWire("queued"))
        assertEquals(WatchStatus.WATCHING, WatchStatus.fromWire("watching"))
        assertEquals(WatchStatus.SKIPPED, WatchStatus.fromWire("skipped"))
    }
    @Test fun status_unknown_or_null_degrades_to_unset() {
        assertEquals(WatchStatus.UNSET, WatchStatus.fromWire("bogus"))
        assertEquals(WatchStatus.UNSET, WatchStatus.fromWire(null))
    }
    @Test fun rating_parses_and_scores() {
        assertEquals(Rating.LOVED, Rating.fromWire("loved"))
        assertEquals(Rating.LIKED, Rating.fromWire("liked"))
        assertEquals(2, Rating.LOVED.score)
        assertEquals(1, Rating.LIKED.score)
        assertEquals(0, Rating.UNRATED.score)
    }
    @Test fun rating_unknown_or_null_degrades_to_unrated() {
        assertEquals(Rating.UNRATED, Rating.fromWire("meh"))
        assertEquals(Rating.UNRATED, Rating.fromWire(null))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*EnumParsingTest*"`
Expected: FAIL — `WatchStatus` / `Rating` unresolved.

- [ ] **Step 3: Write the implementations**

`WatchStatus.kt`:

```kotlin
package com.cinemath.shared.domain

enum class WatchStatus(val wire: String?) {
    UNSET(null),
    QUEUED("queued"),
    WATCHING("watching"),
    WATCHED("watched"),
    SKIPPED("skipped");

    companion object {
        fun fromWire(s: String?): WatchStatus =
            entries.firstOrNull { it.wire != null && it.wire == s } ?: UNSET
    }
}
```

`Rating.kt`:

```kotlin
package com.cinemath.shared.domain

enum class Rating(val wire: String?, val score: Int) {
    UNRATED(null, 0),
    DISLIKED("disliked", 0),
    LIKED("liked", 1),
    LOVED("loved", 2);

    companion object {
        fun fromWire(s: String?): Rating =
            entries.firstOrNull { it.wire != null && it.wire == s } ?: UNRATED
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*EnumParsingTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): WatchStatus + Rating sealed enums with lenient parsing"
```

---

### Task 3: Shared `normalizeTitle` util

Consolidates the three duplicated regexes from the PWA (audit tech-debt + spec §5).

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/domain/TitleNormalizer.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/domain/TitleNormalizerTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces: `fun normalizeTitle(raw: String): String` — lowercased, accents/punctuation stripped, leading article removed, whitespace collapsed. Used by Plex matching in M4 and item-key building here.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.cinemath.shared.domain

import kotlin.test.Test
import kotlin.test.assertEquals

class TitleNormalizerTest {
    @Test fun lowercases_and_trims() = assertEquals("chinatown", normalizeTitle("  Chinatown  "))
    @Test fun strips_punctuation() = assertEquals("oceans eleven", normalizeTitle("Ocean's Eleven"))
    @Test fun drops_leading_article() = assertEquals("big lebowski", normalizeTitle("The Big Lebowski"))
    @Test fun collapses_whitespace() = assertEquals("la confidential", normalizeTitle("L.A.  Confidential"))
    @Test fun strips_accents() = assertEquals("amelie", normalizeTitle("Amélie"))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*TitleNormalizerTest*"`
Expected: FAIL — `normalizeTitle` unresolved.

- [ ] **Step 3: Write the implementation**

```kotlin
package com.cinemath.shared.domain

private val ACCENTS = mapOf(
    'á' to 'a', 'à' to 'a', 'â' to 'a', 'ä' to 'a', 'ã' to 'a',
    'é' to 'e', 'è' to 'e', 'ê' to 'e', 'ë' to 'e',
    'í' to 'i', 'ì' to 'i', 'î' to 'i', 'ï' to 'i',
    'ó' to 'o', 'ò' to 'o', 'ô' to 'o', 'ö' to 'o', 'õ' to 'o',
    'ú' to 'u', 'ù' to 'u', 'û' to 'u', 'ü' to 'u',
    'ñ' to 'n', 'ç' to 'c',
)

fun normalizeTitle(raw: String): String {
    val deAccented = buildString {
        for (ch in raw.lowercase()) append(ACCENTS[ch] ?: ch)
    }
    val alnum = deAccented.map { if (it.isLetterOrDigit() || it == ' ') it else ' ' }.joinToString("")
    val collapsed = alnum.split(' ').filter { it.isNotBlank() }
    val dropped = if (collapsed.firstOrNull() in setOf("the", "a", "an") && collapsed.size > 1)
        collapsed.drop(1) else collapsed
    return dropped.joinToString(" ")
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*TitleNormalizerTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): single shared normalizeTitle util"
```

---

### Task 4: Catalog domain models + validated parse

Mirrors the real JSON (`data/crime.json`, `data/catalogs.json`). Malformed items are skipped, not fatal (spec §7).

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/domain/Catalog.kt`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/data/CatalogParser.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/data/CatalogParserTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Domain: `data class CatalogItem(val id: String, val title: String, val year: Int?, val dir: String?, val country: String?, val runtime: String?, val priority: String?, val tags: List<String>, val whyPriority: String?, val pitch: String?)`
  - `data class CatalogSection(val name: String, val desc: String?, val items: List<CatalogItem>)`
  - `data class Catalog(val tab: String, val title: String, val subtitle: String?, val sections: List<CatalogSection>)`
  - `data class CatalogTabRef(val id: String, val label: String, val virtual: Boolean)`
  - `object CatalogParser { fun parseCatalog(tab: String, json: String): Catalog; fun parseManifest(json: String): List<CatalogTabRef> }`
  - `fun itemId(title: String, year: Int?): String` — the stable slug used in the `"tab:itemId"` state key.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.domain.CatalogParser
import com.cinemath.shared.domain.itemId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CatalogParserTest {
    private val crime = """
      { "type":"crime","title":"Crime","subtitle":"Noir.",
        "sections":[ { "name":"I. High Priority","desc":"d",
          "items":[
            {"title":"Chinatown","year":1974,"dir":"Roman Polanski","country":"USA",
             "runtime":"131 min","priority":"high","tags":["foundational"],
             "whyPriority":"w","pitch":"p","critics":[{"who":"AA","quote":"q"}]},
            {"title":"Broken","year":null}
          ] } ] }
    """.trimIndent()

    private val manifest = """
      { "catalogs":[
        {"id":"watchlist","label":"Watchlist","virtual":true},
        {"id":"crime","label":"Crime"} ] }
    """.trimIndent()

    @Test fun parses_catalog_items() {
        val c = CatalogParser.parseCatalog("crime", crime)
        assertEquals("Crime", c.title)
        assertEquals(1, c.sections.size)
        val first = c.sections[0].items[0]
        assertEquals("Chinatown", first.title)
        assertEquals(1974, first.year)
        assertEquals("Roman Polanski", first.dir)
        assertEquals(listOf("foundational"), first.tags)
    }
    @Test fun item_id_is_slug_year() {
        assertEquals("chinatown-1974", itemId("Chinatown", 1974))
        assertEquals("l-a-confidential-1997", itemId("L.A. Confidential", 1997))
    }
    @Test fun missing_optional_fields_default_not_crash() {
        val c = CatalogParser.parseCatalog("crime", crime)
        val broken = c.sections[0].items[1]
        assertEquals("Broken", broken.title)
        assertEquals(null, broken.year)
        assertTrue(broken.tags.isEmpty())
    }
    @Test fun parses_manifest_and_flags_virtual() {
        val tabs = CatalogParser.parseManifest(manifest)
        assertEquals(2, tabs.size)
        assertTrue(tabs.first { it.id == "watchlist" }.virtual)
        assertTrue(!tabs.first { it.id == "crime" }.virtual)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogParserTest*"`
Expected: FAIL — unresolved references.

- [ ] **Step 3: Write the domain models**

`Catalog.kt`:

```kotlin
package com.cinemath.shared.domain

data class CatalogItem(
    val id: String,
    val title: String,
    val year: Int?,
    val dir: String?,
    val country: String?,
    val runtime: String?,
    val priority: String?,
    val tags: List<String>,
    val whyPriority: String?,
    val pitch: String?,
)

data class CatalogSection(val name: String, val desc: String?, val items: List<CatalogItem>)
data class Catalog(val tab: String, val title: String, val subtitle: String?, val sections: List<CatalogSection>)
data class CatalogTabRef(val id: String, val label: String, val virtual: Boolean)

fun itemId(title: String, year: Int?): String {
    val slug = title.lowercase()
        .map { if (it.isLetterOrDigit()) it else ' ' }.joinToString("")
        .split(' ').filter { it.isNotBlank() }.joinToString("-")
    return if (year != null) "$slug-$year" else slug
}
```

- [ ] **Step 4: Write the parser (lenient, validating)**

`CatalogParser.kt`:

```kotlin
package com.cinemath.shared.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

object CatalogParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun JsonObject.str(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotEmpty() && it != "null" }
    private fun JsonObject.int(key: String): Int? =
        this[key]?.jsonPrimitive?.intOrNull
    private fun JsonObject.strList(key: String): List<String> =
        (this[key] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()

    fun parseCatalog(tab: String, jsonText: String): Catalog {
        val root = json.parseToJsonElement(jsonText).jsonObject
        val sections = (root["sections"] as? JsonArray).orEmpty().mapNotNull { secEl ->
            val sec = secEl as? JsonObject ?: return@mapNotNull null
            val items = (sec["items"] as? JsonArray).orEmpty().mapNotNull { itEl ->
                val it = itEl as? JsonObject ?: return@mapNotNull null
                val title = it.str("title") ?: return@mapNotNull null  // title is required; skip if absent
                val year = it.int("year")
                CatalogItem(
                    id = itemId(title, year),
                    title = title, year = year,
                    dir = it.str("dir"), country = it.str("country"),
                    runtime = it.str("runtime"), priority = it.str("priority"),
                    tags = it.strList("tags"),
                    whyPriority = it.str("whyPriority"), pitch = it.str("pitch"),
                )
            }
            CatalogSection(name = sec.str("name") ?: "", desc = sec.str("desc"), items = items)
        }
        return Catalog(tab = tab, title = root.str("title") ?: tab, subtitle = root.str("subtitle"), sections = sections)
    }

    fun parseManifest(jsonText: String): List<CatalogTabRef> {
        val root = json.parseToJsonElement(jsonText).jsonObject
        return (root["catalogs"] as? JsonArray).orEmpty().mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val id = o.str("id") ?: return@mapNotNull null
            CatalogTabRef(id = id, label = o.str("label") ?: id,
                virtual = o["virtual"]?.jsonPrimitive?.booleanOrNull ?: false)
        }
    }
}

private fun JsonArray?.orEmpty(): List<kotlinx.serialization.json.JsonElement> = this ?: emptyList()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogParserTest*"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): catalog domain models + lenient validating parser"
```

---

### Task 5: SQLDelight schema + DAO

`item_state` and `catalog_cache` (spec §4.2). `tmdb_cache`, `plex_library`, `sync_queue` are deferred to their milestones.

**Files:**
- Create: `cinemath-native/shared/src/commonMain/sqldelight/com/cinemath/shared/db/CineMath.sq`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/db/DriverFactory.kt`
- Create: `cinemath-native/shared/src/androidMain/kotlin/com/cinemath/shared/db/DriverFactory.android.kt`
- Create: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/db/TestDriverFactory.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/db/DatabaseTest.kt`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - SQLDelight-generated `CineMathDb` with queries `upsertItemState`, `selectItemState(key)`, `selectAllItemState`, `upsertCatalogCache`, `selectCatalogCache(tab)`, `selectCatalogTabs`, `countCatalogCache`.
  - `expect class DriverFactory { fun create(): SqlDriver }` (androidMain actual; commonTest uses an in-memory JVM driver).

- [ ] **Step 1: Write the schema**

`CineMath.sq`:

```sql
CREATE TABLE item_state (
    key TEXT NOT NULL PRIMARY KEY,   -- "tab:itemId"
    status TEXT,                     -- WatchStatus.wire
    rating TEXT,                     -- Rating.wire
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    last_updated INTEGER NOT NULL
);

CREATE TABLE catalog_cache (
    tab TEXT NOT NULL PRIMARY KEY,
    json TEXT NOT NULL,
    etag TEXT,                       -- NULL in M1a; populated by M1b remote refresh
    fetched_at INTEGER NOT NULL
);

upsertItemState:
INSERT OR REPLACE INTO item_state(key, status, rating, tags_json, notes, last_updated)
VALUES (?, ?, ?, ?, ?, ?);

selectItemState:
SELECT * FROM item_state WHERE key = ?;

selectAllItemState:
SELECT * FROM item_state;

upsertCatalogCache:
INSERT OR REPLACE INTO catalog_cache(tab, json, etag, fetched_at)
VALUES (?, ?, ?, ?);

selectCatalogCache:
SELECT * FROM catalog_cache WHERE tab = ?;

selectCatalogTabs:
SELECT tab FROM catalog_cache ORDER BY tab;

countCatalogCache:
SELECT COUNT(*) FROM catalog_cache;
```

- [ ] **Step 2: Write the driver factory (expect + actual + test)**

`DriverFactory.kt` (commonMain):

```kotlin
package com.cinemath.shared.db

import app.cash.sqldelight.db.SqlDriver

expect class DriverFactory {
    fun create(): SqlDriver
}
```

`DriverFactory.android.kt` (androidMain):

```kotlin
package com.cinemath.shared.db

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

actual class DriverFactory(private val context: Context) {
    actual fun create(): SqlDriver =
        AndroidSqliteDriver(CineMathDb.Schema, context, "cinemath.db")
}
```

`TestDriverFactory.kt` (commonTest):

```kotlin
package com.cinemath.shared.db

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver

fun inMemoryDb(): CineMathDb {
    val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
    CineMathDb.Schema.create(driver)
    return CineMathDb(driver)
}
```

- [ ] **Step 3: Write the failing DAO test**

`DatabaseTest.kt`:

```kotlin
package com.cinemath.shared.db

import kotlin.test.Test
import kotlin.test.assertEquals

class DatabaseTest {
    @Test fun upsert_then_select_item_state() {
        val db = inMemoryDb()
        db.cineMathDbQueries.upsertItemState("crime:chinatown-1974", "watched", "loved", "[\"Smart structure\"]", "great", 100L)
        val row = db.cineMathDbQueries.selectItemState("crime:chinatown-1974").executeAsOne()
        assertEquals("watched", row.status)
        assertEquals("loved", row.rating)
        assertEquals("great", row.notes)
    }
    @Test fun upsert_replaces_on_same_key() {
        val db = inMemoryDb()
        db.cineMathDbQueries.upsertItemState("crime:x-2000", "queued", null, "[]", null, 1L)
        db.cineMathDbQueries.upsertItemState("crime:x-2000", "watched", "liked", "[]", null, 2L)
        assertEquals(1, db.cineMathDbQueries.selectAllItemState().executeAsList().size)
        assertEquals("watched", db.cineMathDbQueries.selectItemState("crime:x-2000").executeAsOne().status)
    }
    @Test fun catalog_cache_count() {
        val db = inMemoryDb()
        db.cineMathDbQueries.upsertCatalogCache("crime", "{}", null, 5L)
        assertEquals(1L, db.cineMathDbQueries.countCatalogCache().executeAsOne())
    }
}
```

> Note: the generated queries accessor is `db.cineMathDbQueries` (SQLDelight derives it from the database name `CineMathDb`). If the generated name differs after Step 4's build, adjust the test references to match the generated symbol.

- [ ] **Step 4: Generate the DB + run the test**

Run: `./gradlew :shared:generateCommonMainCineMathDbInterface :shared:testDebugUnitTest --tests "*DatabaseTest*"`
Expected: code generation succeeds, then PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): SQLDelight schema (item_state, catalog_cache) + DAO tests"
```

---

### Task 6: Bundle catalog assets + asset reader + first-run seed

Copy the 24 catalog files in, read them on Android, seed `catalog_cache` once.

**Files:**
- Create: `cinemath-native/app-phone/src/androidMain/assets/data/` (24 `*.json` + `catalogs.json`, copied verbatim)
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/data/CatalogAssetSource.kt`
- Create: `cinemath-native/shared/src/androidMain/kotlin/com/cinemath/shared/data/CatalogAssetSource.android.kt`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/data/CatalogSeeder.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/data/CatalogSeederTest.kt`

**Interfaces:**
- Consumes: `CatalogParser` (Task 4), `CineMathDb` (Task 5).
- Produces:
  - `interface CatalogAssetSource { fun manifestJson(): String; fun catalogJson(tab: String): String? }`
  - `class CatalogSeeder(db, assets, now: () -> Long) { fun seedIfEmpty() }` — if `countCatalogCache()==0`, parse the manifest, and for each non-virtual tab read+store its raw JSON into `catalog_cache`.

- [ ] **Step 1: Copy the catalog assets**

```bash
mkdir -p cinemath-native/app-phone/src/androidMain/assets/data
cp data/*.json cinemath-native/app-phone/src/androidMain/assets/data/
ls cinemath-native/app-phone/src/androidMain/assets/data | wc -l   # expect 25 (24 catalogs + catalogs.json + auteur.json variants)
```

- [ ] **Step 2: Write the asset source (expect/actual) + a fake for tests**

`CatalogAssetSource.android.kt` (androidMain):

```kotlin
package com.cinemath.shared.data

import android.content.Context

class AndroidCatalogAssetSource(private val context: Context) : CatalogAssetSource {
    override fun manifestJson(): String =
        context.assets.open("data/catalogs.json").bufferedReader().use { it.readText() }
    override fun catalogJson(tab: String): String? =
        try { context.assets.open("data/$tab.json").bufferedReader().use { it.readText() } }
        catch (e: Exception) { null }
}
```

`CatalogAssetSource.kt` (commonMain):

```kotlin
package com.cinemath.shared.data

interface CatalogAssetSource {
    fun manifestJson(): String
    fun catalogJson(tab: String): String?
}
```

- [ ] **Step 3: Write the failing seeder test**

`CatalogSeederTest.kt`:

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.db.inMemoryDb
import kotlin.test.Test
import kotlin.test.assertEquals

private class FakeAssets : CatalogAssetSource {
    override fun manifestJson() = """
       {"catalogs":[
         {"id":"watchlist","label":"Watchlist","virtual":true},
         {"id":"crime","label":"Crime"},
         {"id":"drama","label":"Drama"}]}""".trimIndent()
    override fun catalogJson(tab: String) = when (tab) {
        "crime" -> """{"type":"crime","title":"Crime","sections":[]}"""
        "drama" -> """{"type":"drama","title":"Drama","sections":[]}"""
        else -> null
    }
}

class CatalogSeederTest {
    @Test fun seeds_non_virtual_tabs_only_once() {
        val db = inMemoryDb()
        val seeder = CatalogSeeder(db, FakeAssets()) { 42L }
        seeder.seedIfEmpty()
        assertEquals(2L, db.cineMathDbQueries.countCatalogCache().executeAsOne())  // watchlist skipped
        seeder.seedIfEmpty()  // idempotent
        assertEquals(2L, db.cineMathDbQueries.countCatalogCache().executeAsOne())
        assertEquals(42L, db.cineMathDbQueries.selectCatalogCache("crime").executeAsOne().fetched_at)
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogSeederTest*"`
Expected: FAIL — `CatalogSeeder` unresolved.

- [ ] **Step 5: Write the seeder**

`CatalogSeeder.kt`:

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.db.CineMathDb
import com.cinemath.shared.domain.CatalogParser

class CatalogSeeder(
    private val db: CineMathDb,
    private val assets: CatalogAssetSource,
    private val now: () -> Long,
) {
    fun seedIfEmpty() {
        if (db.cineMathDbQueries.countCatalogCache().executeAsOne() > 0L) return
        val tabs = CatalogParser.parseManifest(assets.manifestJson())
        val ts = now()
        for (tab in tabs) {
            if (tab.virtual) continue
            val json = assets.catalogJson(tab.id) ?: continue
            db.cineMathDbQueries.upsertCatalogCache(tab.id, json, null, ts)
        }
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogSeederTest*"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cinemath-native
git commit -m "feat(native): bundle catalog assets + first-run SQLDelight seed"
```

---

### Task 7: CatalogRepository

Reactive read API over the cache.

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/data/CatalogRepository.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/data/CatalogRepositoryTest.kt`

**Interfaces:**
- Consumes: `CineMathDb`, `CatalogParser`, the seeded `catalog_cache`.
- Produces:
  - `class CatalogRepository(db) { fun tabs(): List<String>; fun catalog(tab: String): Catalog? }`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.db.inMemoryDb
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CatalogRepositoryTest {
    private fun seeded() = inMemoryDb().also {
        it.cineMathDbQueries.upsertCatalogCache(
            "crime",
            """{"title":"Crime","sections":[{"name":"S1","items":[{"title":"Chinatown","year":1974}]}]}""",
            null, 1L)
    }
    @Test fun lists_tabs() = assertEquals(listOf("crime"), CatalogRepository(seeded()).tabs())
    @Test fun parses_catalog_from_cache() {
        val c = CatalogRepository(seeded()).catalog("crime")!!
        assertEquals("Chinatown", c.sections[0].items[0].title)
    }
    @Test fun missing_tab_is_null() = assertNull(CatalogRepository(seeded()).catalog("nope"))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogRepositoryTest*"`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.db.CineMathDb
import com.cinemath.shared.domain.Catalog
import com.cinemath.shared.domain.CatalogParser

class CatalogRepository(private val db: CineMathDb) {
    fun tabs(): List<String> = db.cineMathDbQueries.selectCatalogTabs().executeAsList()
    fun catalog(tab: String): Catalog? {
        val row = db.cineMathDbQueries.selectCatalogCache(tab).executeAsOneOrNull() ?: return null
        return CatalogParser.parseCatalog(tab, row.json)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*CatalogRepositoryTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): CatalogRepository over cache"
```

---

### Task 8: ItemStateRepository (local optimistic writes)

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/domain/ItemState.kt`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/data/ItemStateRepository.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/data/ItemStateRepositoryTest.kt`

**Interfaces:**
- Consumes: `CineMathDb`, `WatchStatus`, `Rating` (Task 2).
- Produces:
  - `data class ItemState(val key: String, val status: WatchStatus, val rating: Rating, val reactionTags: List<String>, val notes: String?, val lastUpdated: Long)`
  - `fun stateKey(tab: String, itemId: String): String = "$tab:$itemId"`
  - `class ItemStateRepository(db, now: () -> Long) { fun get(key): ItemState?; fun observeAll(): Flow<Map<String, ItemState>>; fun setStatus(key, WatchStatus); fun setRating(key, Rating); fun setReactionTags(key, List<String>); fun setNotes(key, String?) }`
  - Each setter is a read-modify-write that stamps `last_updated = now()` (client-side LWW basis for M1b merge).

- [ ] **Step 1: Write the failing test**

```kotlin
package com.cinemath.shared.data

import com.cinemath.shared.db.inMemoryDb
import com.cinemath.shared.domain.Rating
import com.cinemath.shared.domain.WatchStatus
import kotlin.test.Test
import kotlin.test.assertEquals

class ItemStateRepositoryTest {
    private var clock = 0L
    private fun repo() = ItemStateRepository(inMemoryDb()) { ++clock }

    @Test fun set_status_creates_row() {
        val r = repo(); val k = stateKey("crime", "chinatown-1974")
        r.setStatus(k, WatchStatus.WATCHED)
        assertEquals(WatchStatus.WATCHED, r.get(k)!!.status)
    }
    @Test fun set_rating_preserves_existing_status() {
        val r = repo(); val k = stateKey("crime", "x-2000")
        r.setStatus(k, WatchStatus.WATCHED)
        r.setRating(k, Rating.LOVED)
        val s = r.get(k)!!
        assertEquals(WatchStatus.WATCHED, s.status)
        assertEquals(Rating.LOVED, s.rating)
    }
    @Test fun set_reaction_tags_roundtrips_list() {
        val r = repo(); val k = stateKey("musicals", "wicked-2024")
        r.setReactionTags(k, listOf("Powerhouse vocals", "Earned emotion"))
        assertEquals(listOf("Powerhouse vocals", "Earned emotion"), r.get(k)!!.reactionTags)
    }
    @Test fun each_write_advances_last_updated() {
        val r = repo(); val k = stateKey("crime", "y-1999")
        r.setStatus(k, WatchStatus.QUEUED)
        val t1 = r.get(k)!!.lastUpdated
        r.setRating(k, Rating.LIKED)
        assertEquals(true, r.get(k)!!.lastUpdated > t1)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*ItemStateRepositoryTest*"`
Expected: FAIL.

- [ ] **Step 3: Write the model + repository**

`ItemState.kt`:

```kotlin
package com.cinemath.shared.domain

data class ItemState(
    val key: String,
    val status: WatchStatus,
    val rating: Rating,
    val reactionTags: List<String>,
    val notes: String?,
    val lastUpdated: Long,
)
```

`ItemStateRepository.kt`:

```kotlin
package com.cinemath.shared.data

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.cinemath.shared.db.CineMathDb
import com.cinemath.shared.domain.ItemState
import com.cinemath.shared.domain.Rating
import com.cinemath.shared.domain.WatchStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer

fun stateKey(tab: String, itemId: String): String = "$tab:$itemId"

class ItemStateRepository(
    private val db: CineMathDb,
    private val now: () -> Long,
) {
    private val q = db.cineMathDbQueries
    private val json = Json

    private fun encodeTags(tags: List<String>) =
        json.encodeToString(ListSerializer(String.serializer()), tags)
    private fun decodeTags(s: String?) =
        if (s.isNullOrBlank()) emptyList() else
            runCatching { json.decodeFromString(ListSerializer(String.serializer()), s) }.getOrDefault(emptyList())

    private fun toModel(key: String, status: String?, rating: String?, tagsJson: String, notes: String?, lu: Long) =
        ItemState(key, WatchStatus.fromWire(status), Rating.fromWire(rating), decodeTags(tagsJson), notes, lu)

    fun get(key: String): ItemState? =
        q.selectItemState(key).executeAsOneOrNull()?.let {
            toModel(it.key, it.status, it.rating, it.tags_json, it.notes, it.last_updated)
        }

    fun observeAll(): Flow<Map<String, ItemState>> =
        q.selectAllItemState().asFlow().mapToList(Dispatchers.Default).map { rows ->
            rows.associate { it.key to toModel(it.key, it.status, it.rating, it.tags_json, it.notes, it.last_updated) }
        }

    private fun write(key: String, mutate: (ItemState) -> ItemState) {
        val current = get(key) ?: ItemState(key, WatchStatus.UNSET, Rating.UNRATED, emptyList(), null, 0L)
        val next = mutate(current).copy(lastUpdated = now())
        q.upsertItemState(key, next.status.wire, next.rating.wire, encodeTags(next.reactionTags), next.notes, next.lastUpdated)
    }

    fun setStatus(key: String, status: WatchStatus) = write(key) { it.copy(status = status) }
    fun setRating(key: String, rating: Rating) = write(key) { it.copy(rating = rating) }
    fun setReactionTags(key: String, tags: List<String>) = write(key) { it.copy(reactionTags = tags) }
    fun setNotes(key: String, notes: String?) = write(key) { it.copy(notes = notes) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*ItemStateRepositoryTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): ItemStateRepository with optimistic local writes + LWW timestamps"
```

---

### Task 9: ViewModels (MVI StateFlow)

KMP-friendly ViewModels (plain classes holding a `CoroutineScope`; the Android layer owns the scope).

**Files:**
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/presentation/CatalogListViewModel.kt`
- Create: `cinemath-native/shared/src/commonMain/kotlin/com/cinemath/shared/presentation/ItemDetailViewModel.kt`
- Test: `cinemath-native/shared/src/commonTest/kotlin/com/cinemath/shared/presentation/ItemDetailViewModelTest.kt`

**Interfaces:**
- Consumes: `CatalogRepository` (Task 7), `ItemStateRepository` (Task 8).
- Produces:
  - `data class CatalogListUiState(val tabs: List<String>, val selectedTab: String?, val catalog: Catalog?, val states: Map<String, ItemState>)`
  - `class CatalogListViewModel(catalogRepo, stateRepo, scope) { val uiState: StateFlow<CatalogListUiState>; fun selectTab(tab: String) }`
  - `data class ItemDetailUiState(val item: CatalogItem?, val state: ItemState?)`
  - `class ItemDetailViewModel(catalogRepo, stateRepo, scope) { val uiState: StateFlow<ItemDetailUiState>; fun load(tab, itemId); fun setStatus(WatchStatus); fun setRating(Rating); fun toggleReactionTag(String) }`

- [ ] **Step 1: Write the failing test**

```kotlin
package com.cinemath.shared.presentation

import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.db.inMemoryDb
import com.cinemath.shared.domain.Rating
import com.cinemath.shared.domain.WatchStatus
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

class ItemDetailViewModelTest {
    private fun fixtures() = inMemoryDb().also {
        it.cineMathDbQueries.upsertCatalogCache(
            "crime",
            """{"title":"Crime","sections":[{"name":"S","items":[{"title":"Chinatown","year":1974}]}]}""",
            null, 1L)
    }
    @Test fun load_then_set_status_and_rating_updates_state() = runTest {
        val db = fixtures()
        var clock = 0L
        val vm = ItemDetailViewModel(CatalogRepository(db), ItemStateRepository(db) { ++clock }, this)
        vm.load("crime", "chinatown-1974")
        assertEquals("Chinatown", vm.uiState.value.item?.title)
        vm.setStatus(WatchStatus.WATCHED)
        vm.setRating(Rating.LOVED)
        assertEquals(WatchStatus.WATCHED, vm.uiState.value.state?.status)
        assertEquals(Rating.LOVED, vm.uiState.value.state?.rating)
    }
    @Test fun toggle_reaction_tag_adds_then_removes() = runTest {
        val db = fixtures()
        val vm = ItemDetailViewModel(CatalogRepository(db), ItemStateRepository(db) { 1L }, this)
        vm.load("crime", "chinatown-1974")
        vm.toggleReactionTag("Smart structure")
        assertEquals(listOf("Smart structure"), vm.uiState.value.state?.reactionTags)
        vm.toggleReactionTag("Smart structure")
        assertEquals(emptyList(), vm.uiState.value.state?.reactionTags)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :shared:testDebugUnitTest --tests "*ItemDetailViewModelTest*"`
Expected: FAIL.

- [ ] **Step 3: Write the ViewModels**

`ItemDetailViewModel.kt`:

```kotlin
package com.cinemath.shared.presentation

import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.data.stateKey
import com.cinemath.shared.domain.CatalogItem
import com.cinemath.shared.domain.ItemState
import com.cinemath.shared.domain.Rating
import com.cinemath.shared.domain.WatchStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class ItemDetailUiState(val item: CatalogItem? = null, val state: ItemState? = null)

class ItemDetailViewModel(
    private val catalogRepo: CatalogRepository,
    private val stateRepo: ItemStateRepository,
    private val scope: CoroutineScope,
) {
    private val _ui = MutableStateFlow(ItemDetailUiState())
    val uiState: StateFlow<ItemDetailUiState> = _ui.asStateFlow()
    private var key: String? = null

    fun load(tab: String, itemId: String) {
        val k = stateKey(tab, itemId); key = k
        val item = catalogRepo.catalog(tab)?.sections?.flatMap { it.items }?.firstOrNull { it.id == itemId }
        _ui.value = ItemDetailUiState(item = item, state = stateRepo.get(k))
    }
    private fun refresh() { key?.let { k -> _ui.value = _ui.value.copy(state = stateRepo.get(k)) } }

    fun setStatus(s: WatchStatus) { key?.let { stateRepo.setStatus(it, s); refresh() } }
    fun setRating(r: Rating) { key?.let { stateRepo.setRating(it, r); refresh() } }
    fun toggleReactionTag(tag: String) {
        val k = key ?: return
        val current = stateRepo.get(k)?.reactionTags ?: emptyList()
        val next = if (tag in current) current - tag else current + tag
        stateRepo.setReactionTags(k, next); refresh()
    }
}
```

`CatalogListViewModel.kt`:

```kotlin
package com.cinemath.shared.presentation

import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.domain.Catalog
import com.cinemath.shared.domain.ItemState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

data class CatalogListUiState(
    val tabs: List<String> = emptyList(),
    val selectedTab: String? = null,
    val catalog: Catalog? = null,
    val states: Map<String, ItemState> = emptyMap(),
)

class CatalogListViewModel(
    private val catalogRepo: CatalogRepository,
    private val stateRepo: ItemStateRepository,
    private val scope: CoroutineScope,
) {
    private val _ui = MutableStateFlow(CatalogListUiState())
    val uiState: StateFlow<CatalogListUiState> = _ui.asStateFlow()

    init {
        val tabs = catalogRepo.tabs()
        _ui.value = _ui.value.copy(tabs = tabs)
        tabs.firstOrNull()?.let { selectTab(it) }
        stateRepo.observeAll().onEach { m -> _ui.value = _ui.value.copy(states = m) }.launchIn(scope)
    }

    fun selectTab(tab: String) {
        _ui.value = _ui.value.copy(selectedTab = tab, catalog = catalogRepo.catalog(tab))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :shared:testDebugUnitTest --tests "*ItemDetailViewModelTest*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/shared
git commit -m "feat(native): CatalogList + ItemDetail ViewModels (StateFlow)"
```

---

### Task 10: Koin DI + Android app bootstrap

Wire the graph and seed-on-first-run; replace the placeholder MainActivity content.

**Files:**
- Create: `cinemath-native/shared/src/androidMain/kotlin/com/cinemath/shared/di/SharedModule.kt`
- Modify: `cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/MainActivity.kt`
- Create: `cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/CineMathApp.kt`
- Modify: `cinemath-native/app-phone/src/androidMain/AndroidManifest.xml` (register the Application)

**Interfaces:**
- Consumes: every `:shared` class above.
- Produces: a Koin graph providing `CineMathDb`, `CatalogRepository`, `ItemStateRepository`, and a `CatalogSeeder` run at startup. App nav scaffolding consumed by Tasks 11–12.

- [ ] **Step 1: Write the Koin module**

`SharedModule.kt`:

```kotlin
package com.cinemath.shared.di

import com.cinemath.shared.data.AndroidCatalogAssetSource
import com.cinemath.shared.data.CatalogAssetSource
import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.CatalogSeeder
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.db.CineMathDb
import com.cinemath.shared.db.DriverFactory
import org.koin.dsl.module

fun sharedModule() = module {
    single { DriverFactory(get()).create() }
    single { CineMathDb(get()) }
    single<CatalogAssetSource> { AndroidCatalogAssetSource(get()) }
    single { CatalogSeeder(get(), get()) { System.currentTimeMillis() } }
    single { CatalogRepository(get()) }
    single { ItemStateRepository(get()) { System.currentTimeMillis() } }
}
```

> `DriverFactory(get())` resolves the Android `Context` Koin provides via `androidContext()` in Step 2.

- [ ] **Step 2: Write the Application class (start Koin + seed)**

`CineMathApp.kt`:

```kotlin
package com.cinemath.phone

import android.app.Application
import com.cinemath.shared.data.CatalogSeeder
import com.cinemath.shared.di.sharedModule
import org.koin.android.ext.android.inject
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin

class CineMathApp : Application() {
    private val seeder: CatalogSeeder by inject()
    override fun onCreate() {
        super.onCreate()
        startKoin {
            androidContext(this@CineMathApp)
            modules(sharedModule())
        }
        seeder.seedIfEmpty()
    }
}
```

- [ ] **Step 3: Register the Application in the manifest**

In `AndroidManifest.xml`, add `android:name="com.cinemath.phone.CineMathApp"` to the `<application>` tag.

- [ ] **Step 4: Verify the app builds and seeds (manual smoke)**

Run: `./gradlew :app-phone:installDebug` (with an emulator/device attached), launch the app.
Expected: builds, launches, no crash. (Screens come in Tasks 11–12; the placeholder text still shows.)

- [ ] **Step 5: Commit**

```bash
git add cinemath-native
git commit -m "feat(native): Koin DI graph + first-run seed on app start"
```

---

### Task 11: Catalog list screen (Compose)

**Files:**
- Create: `cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/ui/CatalogListScreen.kt`
- Create: `cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/ui/Theme.kt`
- Modify: `MainActivity.kt` (host the screen + nav)

**Interfaces:**
- Consumes: `CatalogListViewModel` (Task 9).
- Produces: a `CatalogListScreen(vm, onItemClick: (tab, itemId) -> Unit)` composable; each row exposes `Modifier.testTag("item-<itemId>")` for the UI test in Task 12.

- [ ] **Step 1: Write the theme**

`Theme.kt`:

```kotlin
package com.cinemath.phone.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Ink = Color(0xFF0E1116)
private val Accent = Color(0xFFE5B567)

@Composable
fun CineMathTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme())
        darkColorScheme(primary = Accent, background = Ink, surface = Ink)
    else lightColorScheme(primary = Accent)
    MaterialTheme(colorScheme = scheme, content = content)
}
```

- [ ] **Step 2: Write the catalog list screen**

`CatalogListScreen.kt`:

```kotlin
package com.cinemath.phone.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.cinemath.shared.presentation.CatalogListViewModel

@Composable
fun CatalogListScreen(vm: CatalogListViewModel, onItemClick: (String, String) -> Unit) {
    val ui by vm.uiState.collectAsState()
    Column(Modifier.fillMaxSize().padding(8.dp)) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(ui.tabs) { tab ->
                FilterChip(
                    selected = tab == ui.selectedTab,
                    onClick = { vm.selectTab(tab) },
                    label = { Text(tab) },
                    modifier = Modifier.testTag("tab-$tab"),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        val sections = ui.catalog?.sections.orEmpty()
        LazyColumn {
            sections.forEach { section ->
                item { Text(section.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 8.dp)) }
                items(section.items) { item ->
                    val key = "${ui.selectedTab}:${item.id}"
                    val st = ui.states[key]
                    ListItem(
                        headlineContent = { Text(item.title) },
                        supportingContent = { Text(listOfNotNull(item.year?.toString(), item.dir).joinToString(" · ")) },
                        trailingContent = { st?.rating?.wire?.let { Text(it) } },
                        modifier = Modifier
                            .testTag("item-${item.id}")
                            .clickable { onItemClick(ui.selectedTab!!, item.id) },
                    )
                    HorizontalDivider()
                }
            }
        }
    }
}
```

- [ ] **Step 3: Host it in MainActivity with nav**

Replace `MainActivity.kt` body:

```kotlin
package com.cinemath.phone

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.remember
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.cinemath.phone.ui.CatalogListScreen
import com.cinemath.phone.ui.CineMathTheme
import com.cinemath.phone.ui.ItemDetailScreen
import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.presentation.CatalogListViewModel
import com.cinemath.shared.presentation.ItemDetailViewModel
import org.koin.android.ext.android.inject

class MainActivity : ComponentActivity() {
    private val catalogRepo: CatalogRepository by inject()
    private val stateRepo: ItemStateRepository by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            CineMathTheme {
                val nav = rememberNavController()
                val listVm = remember { CatalogListViewModel(catalogRepo, stateRepo, lifecycleScope) }
                NavHost(nav, startDestination = "list") {
                    composable("list") {
                        CatalogListScreen(listVm) { tab, itemId -> nav.navigate("detail/$tab/$itemId") }
                    }
                    composable("detail/{tab}/{itemId}") { back ->
                        val tab = back.arguments?.getString("tab")!!
                        val itemId = back.arguments?.getString("itemId")!!
                        val detailVm = remember(tab, itemId) {
                            ItemDetailViewModel(catalogRepo, stateRepo, lifecycleScope).also { it.load(tab, itemId) }
                        }
                        ItemDetailScreen(detailVm)
                    }
                }
            }
        }
    }
}
```

> `ItemDetailScreen` is created in Task 12; this file won't compile until then. Implement Task 12 before running the build in Task 12 Step 4.

- [ ] **Step 4: Commit**

```bash
git add cinemath-native/app-phone
git commit -m "feat(native): catalog list screen + theme + nav host"
```

---

### Task 12: Item detail screen + status/rating/tag controls + UI test

**Files:**
- Create: `cinemath-native/app-phone/src/androidMain/kotlin/com/cinemath/phone/ui/ItemDetailScreen.kt`
- Test: `cinemath-native/app-phone/src/androidTest/kotlin/com/cinemath/phone/ItemDetailScreenTest.kt`

**Interfaces:**
- Consumes: `ItemDetailViewModel` (Task 9).
- Produces: `ItemDetailScreen(vm)` with controls tagged `status-watched`, `rating-loved`, `tag-<name>` for the instrumentation test.

- [ ] **Step 1: Write the detail screen**

`ItemDetailScreen.kt`:

```kotlin
package com.cinemath.phone.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.cinemath.shared.domain.Rating
import com.cinemath.shared.domain.WatchStatus
import com.cinemath.shared.presentation.ItemDetailViewModel

private val REACTION_TAGS = listOf(
    "Rewatchable", "Stayed with me", "Visually stunning",
    "Want more like this", "Emotionally resonant", "Smart structure",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ItemDetailScreen(vm: ItemDetailViewModel) {
    val ui by vm.uiState.collectAsState()
    val item = ui.item ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(item.title, style = MaterialTheme.typography.headlineSmall)
        item.pitch?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 8.dp)) }

        Text("Status", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WatchStatus.entries.filter { it != WatchStatus.UNSET }.forEach { s ->
                FilterChip(
                    selected = ui.state?.status == s,
                    onClick = { vm.setStatus(s) },
                    label = { Text(s.name.lowercase()) },
                    modifier = Modifier.testTag("status-${s.wire}"),
                )
            }
        }

        Text("Rating", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(Rating.LIKED, Rating.LOVED, Rating.DISLIKED).forEach { r ->
                FilterChip(
                    selected = ui.state?.rating == r,
                    onClick = { vm.setRating(r) },
                    label = { Text(r.name.lowercase()) },
                    modifier = Modifier.testTag("rating-${r.wire}"),
                )
            }
        }

        Text("Reactions", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            REACTION_TAGS.forEach { tag ->
                FilterChip(
                    selected = ui.state?.reactionTags?.contains(tag) == true,
                    onClick = { vm.toggleReactionTag(tag) },
                    label = { Text(tag) },
                    modifier = Modifier.testTag("tag-$tag"),
                )
            }
        }
    }
}
```

- [ ] **Step 2: Write the failing instrumentation test**

`ItemDetailScreenTest.kt`:

```kotlin
package com.cinemath.phone

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.cinemath.phone.ui.ItemDetailScreen
import com.cinemath.shared.data.CatalogRepository
import com.cinemath.shared.data.ItemStateRepository
import com.cinemath.shared.db.CineMathDb
import com.cinemath.shared.db.DriverFactory
import androidx.test.platform.app.InstrumentationRegistry
import com.cinemath.shared.presentation.ItemDetailViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.junit.Rule
import org.junit.Test

class ItemDetailScreenTest {
    @get:Rule val rule = createComposeRule()

    @Test fun tapping_status_and_rating_selects_them() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val db = CineMathDb(DriverFactory(ctx).create())
        db.cineMathDbQueries.upsertCatalogCache(
            "crime",
            """{"title":"Crime","sections":[{"name":"S","items":[{"title":"Chinatown","year":1974,"pitch":"x"}]}]}""",
            null, 1L)
        var clock = 0L
        val vm = ItemDetailViewModel(CatalogRepository(db), ItemStateRepository(db) { ++clock }, CoroutineScope(Dispatchers.Main))
        vm.load("crime", "chinatown-1974")

        rule.setContent { ItemDetailScreen(vm) }
        rule.onNodeWithTag("status-watched").performClick()
        rule.onNodeWithTag("status-watched").assertIsSelected()
        rule.onNodeWithTag("rating-loved").performClick()
        rule.onNodeWithTag("rating-loved").assertIsSelected()
    }
}
```

> This is an instrumentation test (`androidTest`) — it needs an emulator/device. The DB write uses a real Android driver against a throwaway `cinemath.db`; acceptable for M1a. (If test isolation matters later, switch to an in-memory Android driver.)

- [ ] **Step 3: Run the test to verify it fails, then passes**

Run: `./gradlew :app-phone:connectedDebugAndroidTest --tests "*ItemDetailScreenTest*"`
Expected first run (before Step 1 existed): FAIL. With the screen implemented: PASS.

- [ ] **Step 4: Full build + manual smoke**

Run: `./gradlew :app-phone:assembleDebug && ./gradlew :app-phone:installDebug`
Manually: launch → tab strip lists catalogs → tap a film → set status WATCHED + rating LOVED + a reaction tag → back out → the row shows the rating → kill and relaunch the app → the rating persists (proves SQLDelight durability, offline).

- [ ] **Step 5: Commit**

```bash
git add cinemath-native/app-phone
git commit -m "feat(native): item detail screen with status/rating/reaction controls + UI test"
```

---

## Self-Review

**Spec coverage (M1a subset of §9 M1 "catalog browse + status/rating/tags, phone"):**
- KMP scaffold + module layout (spec §2) → Task 1. ✓
- SQLDelight replaces IndexedDB (spec §4.2: `item_state`, `catalog_cache`) → Tasks 5, 6. ✓ (`tmdb_cache`/`plex_library`/`sync_queue` deferred to their milestones — correct, not M1a.)
- Domain models ported from JSON (spec §4.1) → Tasks 2, 4, 8. ✓
- Sealed enums replace magic strings (spec §4.1, §10) → Task 2. ✓
- Single shared `normalizeTitle` (spec §5, §10) → Task 3. ✓
- Validated catalog load, malformed item skipped (spec §7, §10) → Task 4. ✓
- Offline-first read from local DB (spec §3) → Tasks 7, 9, 11. ✓
- Optimistic local writes (spec §3 "write: optimistic local update") → Task 8. ✓
- MVI ViewModels → StateFlow (spec §2) → Task 9. ✓
- Compose Material3 phone UI, dark theme `--ink`/`--accent` (spec §6.1) → Tasks 11, 12. ✓
- **Deliberately NOT in M1a (deferred):** pairing + `/sync` pull (M1b), recs engine + wizard + triage (M2), TV (M3), Plex/Trakt/AI (M4), FCM/Keystore/WorkManager (M5). Network write-back held back to avoid clobbering the live PWA (Deviation 2).

**Placeholder scan:** No "TBD"/"TODO". Two forward-references are explicit and intra-plan (MainActivity needs `ItemDetailScreen` from Task 12; `DriverFactory(get())` context wiring) — flagged inline, not placeholders.

**Type consistency:** `cineMathDbQueries` accessor used consistently (flagged as generator-dependent in Task 5). `stateKey(tab,itemId)` and `itemId(title,year)` defined once (Tasks 8, 4) and reused. `WatchStatus.wire`/`Rating.wire`/`Rating.score` consistent across Tasks 2, 8, 9, 12. `ItemState` shape identical in Tasks 8, 9.

---

## Milestone roadmap (this plan is M1a of the M1–M6 program)

| Plan | Scope | Network? |
|------|-------|----------|
| **M1a (this plan)** | Scaffold + offline catalog browse + local status/rating/tags (phone) | No |
| **M1b** | First-run QR pairing → Keystore token → `/sync/get` pull → seed; catalog etag-refresh from GitHub Pages | Read-only |
| **M2** | Kotlin recs engine + golden tests, wizard, triage deck (phone) | — |
| **M3** | `:app-tv` focus nav, side-by-side recs, TV triage | — |
| **M4** | Plex, Trakt (OAuth device flow), AI chat + extras | — |
| **M5** | FCM, Keystore hardening, WorkManager background sync, **`/sync/put` push + client-side LWW merge** | Read-write |
| **M6** | a11y pass, perf, signed APKs, GitHub Releases (+ optional Play internal testing) | — |

Each subsequent milestone gets its own plan written just-in-time (per the writing-plans scope check). The PWA keeps running until M6.
