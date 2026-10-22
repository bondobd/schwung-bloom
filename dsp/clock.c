/*
 * Bloom's clock: hands the UI Move's own transport position, so chords land on Move's beat
 * grid instead of a timer of Bloom's. The UI reads "clock" a few times a second and
 * interpolates between reads; this plugin makes no sound and sends no MIDI.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "vendor/plugin_api_v1.h"

static const host_api_v1_t *g_host;

static void *create_instance(const char *module_dir, const char *json_defaults) {
    (void)module_dir; (void)json_defaults;
    return calloc(1, 1);
}

static void destroy_instance(void *instance) { free(instance); }

static void on_midi(void *instance, const uint8_t *msg, int len, int source) {
    (void)instance; (void)msg; (void)len; (void)source;
}

static void set_param(void *instance, const char *key, const char *val) {
    (void)instance; (void)key; (void)val;
}

/* "clock" answers "<beats since Move's transport started, or -1 when stopped> <bpm>". */
static int get_param(void *instance, const char *key, char *buf, int buf_len) {
    (void)instance;
    if (!key || !buf || buf_len <= 0 || strcmp(key, "clock") != 0) return -1;
    double beat = g_host && g_host->get_beat_position ? g_host->get_beat_position() : -1.0;
    float bpm = g_host && g_host->get_bpm ? g_host->get_bpm() : 0.0f;
    return snprintf(buf, buf_len, "%.4f %.3f", beat, bpm);
}

static int get_error(void *instance, char *buf, int buf_len) {
    (void)instance;
    if (buf && buf_len > 0) buf[0] = '\0';
    return 0;
}

static void render_block(void *instance, int16_t *out, int frames) {
    (void)instance;
    if (out && frames > 0) memset(out, 0, (size_t)frames * 2 * sizeof(int16_t));
}

static plugin_api_v2_t g_api = {
    .api_version = MOVE_PLUGIN_API_VERSION_2,
    .create_instance = create_instance,
    .destroy_instance = destroy_instance,
    .on_midi = on_midi,
    .set_param = set_param,
    .get_param = get_param,
    .get_error = get_error,
    .render_block = render_block
};

plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host) {
    g_host = host;
    return &g_api;
}
