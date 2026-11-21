import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../controllers/systems_controller.dart';
import '../../models/connection.dart';
import '../../widgets/busy_button.dart';
import '../../widgets/section_title.dart';

/// The outside accounts (blueprint 9.1): each one is a stand-in until the owner saves its keys here, and live after.
/// Secret values go one way: the app sends them and the platform never shows them again.
class ConnectionsSection extends StatelessWidget {
  const ConnectionsSection({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SystemsController>();
    return Obx(
      () => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SectionTitle(
            'Connections',
            icon: Icons.hub_outlined,
            detail: 'Each account works for real once its keys are saved. Keys are never shown again, not even here.',
          ),
          for (final connection in controller.connections) _ConnectionCard(key: ValueKey('connection-${connection.id}'), connection: connection),
        ],
      ),
    );
  }
}

class _ConnectionCard extends StatefulWidget {
  const _ConnectionCard({required this.connection, super.key});

  final Connection connection;

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

  Future<void> _save(SystemsController controller) async {
    final saved = await controller.saveConnection(widget.connection, {for (final e in _fields.entries) e.key: e.value.text});
    if (saved) {
      for (final field in _fields.values) {
        field.clear();
      }
    }
  }

  Future<void> _signIn(SystemsController controller) async {
    final url = await controller.gmailSignIn();
    if (url == null) return;
    await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<SystemsController>();
    final scheme = Theme.of(context).colorScheme;
    final connection = widget.connection;
    final id = connection.id;
    return Obx(() {
      final health = controller.connectionHealth[id];
      final note = health?.note ?? connection.lastError;
      final failed = health?.ok == false || (health == null && connection.lastError != null);
      return Card(
        child: ExpansionTile(
          leading: Container(
            width: 40,
            height: 40,
            decoration: ShapeDecoration(
              color: (failed ? scheme.error : (connection.live ? scheme.primary : scheme.onSurfaceVariant)).withValues(alpha: 0.1),
              shape: AppTheme.shape(12),
            ),
            child: Icon(
              failed ? Icons.error_outline : (connection.live ? Icons.link : Icons.link_off),
              size: 20,
              color: failed ? scheme.error : (connection.live ? scheme.primary : scheme.onSurfaceVariant),
            ),
          ),
          title: Row(
            children: [
              Flexible(
                child: Text(connection.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 10),
              // A small pill that says at a glance whether this account is live.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: ShapeDecoration(
                  color: connection.live ? scheme.primary.withValues(alpha: 0.12) : scheme.onSurfaceVariant.withValues(alpha: 0.1),
                  shape: const StadiumBorder(),
                ),
                child: Text(
                  connection.live ? 'Live'.tr : 'Stand-in'.tr,
                  style: Theme.of(context).textTheme.labelSmall
                      ?.copyWith(color: connection.live ? scheme.primary : scheme.onSurfaceVariant, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          subtitle: Text(note ?? (connection.live ? 'Working for real.'.tr : 'Open to add its keys.'.tr), maxLines: 2, overflow: TextOverflow.ellipsis),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (i, step) in connection.steps.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text('${i + 1}. $step', textDirection: TextDirection.ltr),
              ),
            for (final address in connection.addresses)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(address.label, textDirection: TextDirection.ltr),
                subtitle: SelectableText(address.value, textDirection: TextDirection.ltr),
                trailing: IconButton(
                  tooltip: 'Copy'.tr,
                  icon: const Icon(Icons.copy),
                  onPressed: () => Clipboard.setData(ClipboardData(text: address.value)),
                ),
              ),
            for (final field in connection.found)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                title: Text(field.label, textDirection: TextDirection.ltr),
                subtitle: Text('${field.value}', textDirection: TextDirection.ltr, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
            for (final field in connection.typed)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  key: Key('connection-$id-${field.key}'),
                  controller: _field(field.key),
                  obscureText: field.secret,
                  autocorrect: false,
                  enableSuggestions: false,
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(
                    labelText: field.label,
                    helperText: field.help,
                    hintText: field.set ? 'Saved. Type a new one to replace it.'.tr : null,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                BusyButton(key: Key('connection-$id-save'), onPressed: () => _save(controller), label: 'Save'.tr),
                if (connection.googleClientSaved)
                  BusyButton(
                    key: const Key('connection-gmail-sign-in'),
                    kind: ButtonKind.tonal,
                    onPressed: () => _signIn(controller),
                    icon: Icons.login,
                    label: 'Sign in with Google'.tr,
                  ),
                if (connection.live) BusyButton(kind: ButtonKind.outlined, onPressed: () => controller.checkConnection(connection), label: 'Check'.tr),
                if (connection.anySaved)
                  BusyButton(
                    key: Key('connection-$id-disconnect'),
                    kind: ButtonKind.text,
                    onPressed: () => controller.disconnect(connection),
                    label: 'Disconnect'.tr,
                    colour: scheme.error,
                  ),
              ],
            ),
          ],
        ),
      );
    });
  }
}
