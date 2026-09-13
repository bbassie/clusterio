import assert from "node:assert/strict";
import * as lib from "@clusterio/lib";
import { Controller, ControlConnection } from "@clusterio/controller";

describe("controller/src/ControlConnection", function() {
	describe(".handleDebugDumpWsRequest()", function() {
		function makeConnection() {
			const controllerConfig = new lib.ControllerConfig("controller");
			const connector = new lib.VirtualConnector(
				lib.Address.fromShorthand("controller"),
				lib.Address.fromShorthand({ controlId: 1 }),
			);
			connector._socket = {};
			const controller = new Controller(lib.logger, [], controllerConfig);
			const user = controller.users.getOrCreateUser("test");
			return new ControlConnection({ version: "2.0.0" }, connector, controller, user, 1);
		}

		it("re-applies clusterio_ignore_dump to the socket on resume", async function() {
			const connection = makeConnection();
			await connection.handleDebugDumpWsRequest(new lib.DebugDumpWsRequest());
			// A resume installs a fresh socket without the flag.
			const resumedSocket = {};
			connection.connector._socket = resumedSocket;
			connection.connector.emit("resume");
			assert.equal(resumedSocket.clusterio_ignore_dump, true);
		});

		it("leaves the flag off on resume without a dumper", function() {
			const connection = makeConnection();
			const resumedSocket = {};
			connection.connector._socket = resumedSocket;
			connection.connector.emit("resume");
			assert.equal(resumedSocket.clusterio_ignore_dump, false);
		});
	});

	describe(".handleControllerRestartRequest()", function() {
		let mockController;

		beforeEach(function() {
			mockController = {
				canRestart: true,
				shouldRestart: false,
				stopped: false,
				async checkRestartDowngrade() { return null; },
				stop() { this.stopped = true; },
			};
		});

		async function restart() {
			await ControlConnection.prototype.handleControllerRestartRequest.call({
				_controller: mockController,
			});
		}

		it("restarts when the installed version is not older", async function() {
			await restart();
			assert.equal(mockController.shouldRestart, true);
			assert.equal(mockController.stopped, true);
		});

		it("rejects a downgrade without stopping the controller", async function() {
			mockController.checkRestartDowngrade = async () => ({
				installedVersion: "1.0.0",
				runningVersion: "2.0.0",
			});

			await assert.rejects(restart, /Stop the controller before starting the older version manually/);
			assert.equal(mockController.shouldRestart, false);
			assert.equal(mockController.stopped, false);
		});
	});
});
