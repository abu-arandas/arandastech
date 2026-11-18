import 'approvals_service.dart';
import 'business_service.dart';
import 'company_service.dart';
import 'platform_client.dart';
import 'systems_service.dart';
import 'team_service.dart';

/// Every service of one platform, signed in with one owner token.
class Platform {
  const Platform({required this.company, required this.approvals, required this.team, required this.business, required this.systems});

  /// The real platform over HTTP: the one main.dart picks.
  factory Platform.http(String baseUrl, String token) {
    final client = PlatformClient(baseUrl: baseUrl, token: token);
    return Platform(
      company: HttpCompanyService(client),
      approvals: HttpApprovalsService(client),
      team: HttpTeamService(client),
      business: HttpBusinessService(client),
      systems: HttpSystemsService(client),
    );
  }

  final CompanyService company;
  final ApprovalsService approvals;
  final TeamService team;
  final BusinessService business;
  final SystemsService systems;
}

/// Signs in to a platform at an address with the owner token.
typedef PlatformConnector = Platform Function(String baseUrl, String token);
