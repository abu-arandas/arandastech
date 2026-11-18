import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../controllers/owner_controller.dart';
import '../services/api.dart';

/// The outside accounts (blueprint 9.1): each one is a mock until the owner saves its keys here, and live after.
/// Secret values go one way: the app sends them and the platform never shows them again.
class ConnectionsSection extends StatelessWidget {
  const ConnectionsSection({super.key});

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    final theme = Theme.of(context);
    return Obx(
      () => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Connections'.tr, style: theme.textTheme.titleLarge),
          Text(
            'Each account works for real once its keys are saved. Keys are never shown again, not even here.'.tr,
            style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          for (final connection in c.connections) _ConnectionCard(key: ValueKey('connection-${connection['id']}'), connection: connection),
        ],
      ),
    );
  }
}

class _ConnectionCard extends StatefulWidget {
  const _ConnectionCard({super.key, required this.connection});
  final Json connection;

  @override
  State<_ConnectionCard> createState() => _ConnectionCardState();
}

class _ConnectionCardState extends State<_ConnectionCard> {
  final Map<String, TextEditingController> _fields = {};

  TextEditingController _field(String key) => _fields.putIfAbsent(key, TextEditingController.new);

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  Future<void> _save(OwnerController c) async {
    final saved = await c.saveConnection(widget.connection, {for (final e in _fields.entries) e.key: e.value.text});
    if (saved) {
      for (final field in _fields.values) {
        field.clear();
      }
    }
  }

  Future<void> _signIn(OwnerController c) async {
    final url = await c.gmailSignIn();
    if (url == null) return;
    await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');
  }

  @override
  Widget build(BuildContext context) {
    final c = Get.find<OwnerController>();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final connection = widget.connection;
    final id = connection['id'] as String;
    final live = connection['mode'] == 'live';
    final fields = (connection['fields'] as List).cast<Json>();
    final typed = fields.where((f) => f['automatic'] != true).toList();
    final shown = fields.where((f) => f['automatic'] == true && f['value'] != null).toList();
    final addresses = ((connection['addresses'] as List?) ?? const []).cast<Json>();
    final steps = ((connection['steps'] as List?) ?? const []).cast<String>();
    final clientSaved = id == 'gmail' && fields.where((f) => f['key'] == 'client_id' || f['key'] == 'client_secret').every((f) => f['set'] == true);
    return Obx(() {
      final health = c.connectionHealth[id]?['health'] as Json?;
      final note = health?['note'] as String? ?? connection['last_error'] as String?;
      final failed = health?['ok'] == false || (health == null && connection['last_error'] != null);
      return Card(
        child: ExpansionTile(
          leading: Icon(
            failed ? Icons.error_outline : (live ? Icons.check_circle : Icons.radio_button_unchecked),
            color: failed ? scheme.error : (live ? scheme.primary : scheme.onSurfaceVariant),
          ),
          title: Text(connection['name'] as String),
          subtitle: Text([if (live) 'Live'.tr else 'Not connected, works as a stand-in'.tr, ?note].join(' · '), maxLines: 2, overflow: TextOverflow.ellipsis),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, step) in steps.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('${i + 1}. $step', textDirection: TextDirection.ltr),
              ),
            for (final address in addresses)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(address['label'] as String, textDirection: TextDirection.ltr),
                subtitle: SelectableText(address['value'] as String, textDirection: TextDirection.ltr),
                trailing: IconButton(
                  tooltip: 'Copy'.tr,
                  icon: const Icon(Icons.copy),
                  onPressed: () => Clipboard.setData(ClipboardData(text: address['value'] as String)),
                ),
              ),
            for (final field in shown)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(field['label'] as String, textDirection: TextDirection.ltr),
                subtitle: Text('${field['value']}', textDirection: TextDirection.ltr, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
            for (final field in typed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  key: Key('connection-$id-${field['key']}'),
                  controller: _field(field['key'] as String),
                  obscureText: field['secret'] == true,
                  autocorrect: false,
                  enableSuggestions: false,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(
                    labelText: field['label'] as String,
                    helperText: field['help'] as String?,
                    hintText: field['set'] == true ? 'Saved. Type a new one to replace it.'.tr : null,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(key: Key('connection-$id-save'), onPressed: () => _save(c), child: Text('Save'.tr)),
                if (id == 'gmail' && clientSaved)
                  FilledButton.tonalIcon(
                    key: const Key('connection-gmail-sign-in'),
                    onPressed: () => _signIn(c),
                    icon: const Icon(Icons.login),
                    label: Text('Sign in with Google'.tr),
                  ),
                if (live) OutlinedButton(onPressed: () => c.checkConnection(connection), child: Text('Check'.tr)),
                if (fields.any((f) => f['set'] == true))
                  TextButton(
                    key: Key('connection-$id-disconnect'),
                    onPressed: () => c.disconnect(connection),
                    child: Text('Disconnect'.tr, style: TextStyle(color: scheme.error)),
                  ),
              ],
            ),
          ],
        ),
      );
    });
  }
}
