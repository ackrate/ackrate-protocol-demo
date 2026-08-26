#!/usr/bin/env node
import{createRequire as __cr}from'module';const require=__cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// packages/cli/node_modules/commander/lib/error.js
var require_error = __commonJS({
  "packages/cli/node_modules/commander/lib/error.js"(exports) {
    var CommanderError2 = class extends Error {
      /**
       * Constructs the CommanderError class
       * @param {number} exitCode suggested exit code which could be used with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       */
      constructor(exitCode, code, message) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
        this.code = code;
        this.exitCode = exitCode;
        this.nestedError = void 0;
      }
    };
    var InvalidArgumentError2 = class extends CommanderError2 {
      /**
       * Constructs the InvalidArgumentError class
       * @param {string} [message] explanation of why argument is invalid
       */
      constructor(message) {
        super(1, "commander.invalidArgument", message);
        Error.captureStackTrace(this, this.constructor);
        this.name = this.constructor.name;
      }
    };
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
  }
});

// packages/cli/node_modules/commander/lib/argument.js
var require_argument = __commonJS({
  "packages/cli/node_modules/commander/lib/argument.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Argument2 = class {
      /**
       * Initialize a new command argument with the given name and description.
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @param {string} name
       * @param {string} [description]
       */
      constructor(name, description) {
        this.description = description || "";
        this.variadic = false;
        this.parseArg = void 0;
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.argChoices = void 0;
        switch (name[0]) {
          case "<":
            this.required = true;
            this._name = name.slice(1, -1);
            break;
          case "[":
            this.required = false;
            this._name = name.slice(1, -1);
            break;
          default:
            this.required = true;
            this._name = name;
            break;
        }
        if (this._name.length > 3 && this._name.slice(-3) === "...") {
          this.variadic = true;
          this._name = this._name.slice(0, -3);
        }
      }
      /**
       * Return argument name.
       *
       * @return {string}
       */
      name() {
        return this._name;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Argument}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Set the custom handler for processing CLI command arguments into argument values.
       *
       * @param {Function} [fn]
       * @return {Argument}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Only allow argument value to be one of choices.
       *
       * @param {string[]} values
       * @return {Argument}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Make argument required.
       *
       * @returns {Argument}
       */
      argRequired() {
        this.required = true;
        return this;
      }
      /**
       * Make argument optional.
       *
       * @returns {Argument}
       */
      argOptional() {
        this.required = false;
        return this;
      }
    };
    function humanReadableArgName(arg) {
      const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
      return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
    }
    exports.Argument = Argument2;
    exports.humanReadableArgName = humanReadableArgName;
  }
});

// packages/cli/node_modules/commander/lib/help.js
var require_help = __commonJS({
  "packages/cli/node_modules/commander/lib/help.js"(exports) {
    var { humanReadableArgName } = require_argument();
    var Help2 = class {
      constructor() {
        this.helpWidth = void 0;
        this.sortSubcommands = false;
        this.sortOptions = false;
        this.showGlobalOptions = false;
      }
      /**
       * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
       *
       * @param {Command} cmd
       * @returns {Command[]}
       */
      visibleCommands(cmd) {
        const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
        const helpCommand = cmd._getHelpCommand();
        if (helpCommand && !helpCommand._hidden) {
          visibleCommands.push(helpCommand);
        }
        if (this.sortSubcommands) {
          visibleCommands.sort((a, b) => {
            return a.name().localeCompare(b.name());
          });
        }
        return visibleCommands;
      }
      /**
       * Compare options for sort.
       *
       * @param {Option} a
       * @param {Option} b
       * @returns {number}
       */
      compareOptions(a, b) {
        const getSortKey = (option) => {
          return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
        };
        return getSortKey(a).localeCompare(getSortKey(b));
      }
      /**
       * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleOptions(cmd) {
        const visibleOptions = cmd.options.filter((option) => !option.hidden);
        const helpOption = cmd._getHelpOption();
        if (helpOption && !helpOption.hidden) {
          const removeShort = helpOption.short && cmd._findOption(helpOption.short);
          const removeLong = helpOption.long && cmd._findOption(helpOption.long);
          if (!removeShort && !removeLong) {
            visibleOptions.push(helpOption);
          } else if (helpOption.long && !removeLong) {
            visibleOptions.push(
              cmd.createOption(helpOption.long, helpOption.description)
            );
          } else if (helpOption.short && !removeShort) {
            visibleOptions.push(
              cmd.createOption(helpOption.short, helpOption.description)
            );
          }
        }
        if (this.sortOptions) {
          visibleOptions.sort(this.compareOptions);
        }
        return visibleOptions;
      }
      /**
       * Get an array of the visible global options. (Not including help.)
       *
       * @param {Command} cmd
       * @returns {Option[]}
       */
      visibleGlobalOptions(cmd) {
        if (!this.showGlobalOptions) return [];
        const globalOptions = [];
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          const visibleOptions = ancestorCmd.options.filter(
            (option) => !option.hidden
          );
          globalOptions.push(...visibleOptions);
        }
        if (this.sortOptions) {
          globalOptions.sort(this.compareOptions);
        }
        return globalOptions;
      }
      /**
       * Get an array of the arguments if any have a description.
       *
       * @param {Command} cmd
       * @returns {Argument[]}
       */
      visibleArguments(cmd) {
        if (cmd._argsDescription) {
          cmd.registeredArguments.forEach((argument) => {
            argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
          });
        }
        if (cmd.registeredArguments.find((argument) => argument.description)) {
          return cmd.registeredArguments;
        }
        return [];
      }
      /**
       * Get the command term to show in the list of subcommands.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandTerm(cmd) {
        const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
        return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
        (args ? " " + args : "");
      }
      /**
       * Get the option term to show in the list of options.
       *
       * @param {Option} option
       * @returns {string}
       */
      optionTerm(option) {
        return option.flags;
      }
      /**
       * Get the argument term to show in the list of arguments.
       *
       * @param {Argument} argument
       * @returns {string}
       */
      argumentTerm(argument) {
        return argument.name();
      }
      /**
       * Get the longest command term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestSubcommandTermLength(cmd, helper) {
        return helper.visibleCommands(cmd).reduce((max, command) => {
          return Math.max(max, helper.subcommandTerm(command).length);
        }, 0);
      }
      /**
       * Get the longest option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestOptionTermLength(cmd, helper) {
        return helper.visibleOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest global option term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestGlobalOptionTermLength(cmd, helper) {
        return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
          return Math.max(max, helper.optionTerm(option).length);
        }, 0);
      }
      /**
       * Get the longest argument term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      longestArgumentTermLength(cmd, helper) {
        return helper.visibleArguments(cmd).reduce((max, argument) => {
          return Math.max(max, helper.argumentTerm(argument).length);
        }, 0);
      }
      /**
       * Get the command usage to be displayed at the top of the built-in help.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandUsage(cmd) {
        let cmdName = cmd._name;
        if (cmd._aliases[0]) {
          cmdName = cmdName + "|" + cmd._aliases[0];
        }
        let ancestorCmdNames = "";
        for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
          ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
        }
        return ancestorCmdNames + cmdName + " " + cmd.usage();
      }
      /**
       * Get the description for the command.
       *
       * @param {Command} cmd
       * @returns {string}
       */
      commandDescription(cmd) {
        return cmd.description();
      }
      /**
       * Get the subcommand summary to show in the list of subcommands.
       * (Fallback to description for backwards compatibility.)
       *
       * @param {Command} cmd
       * @returns {string}
       */
      subcommandDescription(cmd) {
        return cmd.summary() || cmd.description();
      }
      /**
       * Get the option description to show in the list of options.
       *
       * @param {Option} option
       * @return {string}
       */
      optionDescription(option) {
        const extraInfo = [];
        if (option.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (option.defaultValue !== void 0) {
          const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
          if (showDefault) {
            extraInfo.push(
              `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
            );
          }
        }
        if (option.presetArg !== void 0 && option.optional) {
          extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
        }
        if (option.envVar !== void 0) {
          extraInfo.push(`env: ${option.envVar}`);
        }
        if (extraInfo.length > 0) {
          return `${option.description} (${extraInfo.join(", ")})`;
        }
        return option.description;
      }
      /**
       * Get the argument description to show in the list of arguments.
       *
       * @param {Argument} argument
       * @return {string}
       */
      argumentDescription(argument) {
        const extraInfo = [];
        if (argument.argChoices) {
          extraInfo.push(
            // use stringify to match the display of the default value
            `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
          );
        }
        if (argument.defaultValue !== void 0) {
          extraInfo.push(
            `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
          );
        }
        if (extraInfo.length > 0) {
          const extraDescripton = `(${extraInfo.join(", ")})`;
          if (argument.description) {
            return `${argument.description} ${extraDescripton}`;
          }
          return extraDescripton;
        }
        return argument.description;
      }
      /**
       * Generate the built-in help text.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {string}
       */
      formatHelp(cmd, helper) {
        const termWidth = helper.padWidth(cmd, helper);
        const helpWidth = helper.helpWidth || 80;
        const itemIndentWidth = 2;
        const itemSeparatorWidth = 2;
        function formatItem(term, description) {
          if (description) {
            const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
            return helper.wrap(
              fullText,
              helpWidth - itemIndentWidth,
              termWidth + itemSeparatorWidth
            );
          }
          return term;
        }
        function formatList(textArray) {
          return textArray.join("\n").replace(/^/gm, " ".repeat(itemIndentWidth));
        }
        let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
        const commandDescription = helper.commandDescription(cmd);
        if (commandDescription.length > 0) {
          output = output.concat([
            helper.wrap(commandDescription, helpWidth, 0),
            ""
          ]);
        }
        const argumentList = helper.visibleArguments(cmd).map((argument) => {
          return formatItem(
            helper.argumentTerm(argument),
            helper.argumentDescription(argument)
          );
        });
        if (argumentList.length > 0) {
          output = output.concat(["Arguments:", formatList(argumentList), ""]);
        }
        const optionList = helper.visibleOptions(cmd).map((option) => {
          return formatItem(
            helper.optionTerm(option),
            helper.optionDescription(option)
          );
        });
        if (optionList.length > 0) {
          output = output.concat(["Options:", formatList(optionList), ""]);
        }
        if (this.showGlobalOptions) {
          const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
            return formatItem(
              helper.optionTerm(option),
              helper.optionDescription(option)
            );
          });
          if (globalOptionList.length > 0) {
            output = output.concat([
              "Global Options:",
              formatList(globalOptionList),
              ""
            ]);
          }
        }
        const commandList = helper.visibleCommands(cmd).map((cmd2) => {
          return formatItem(
            helper.subcommandTerm(cmd2),
            helper.subcommandDescription(cmd2)
          );
        });
        if (commandList.length > 0) {
          output = output.concat(["Commands:", formatList(commandList), ""]);
        }
        return output.join("\n");
      }
      /**
       * Calculate the pad width from the maximum term length.
       *
       * @param {Command} cmd
       * @param {Help} helper
       * @returns {number}
       */
      padWidth(cmd, helper) {
        return Math.max(
          helper.longestOptionTermLength(cmd, helper),
          helper.longestGlobalOptionTermLength(cmd, helper),
          helper.longestSubcommandTermLength(cmd, helper),
          helper.longestArgumentTermLength(cmd, helper)
        );
      }
      /**
       * Wrap the given string to width characters per line, with lines after the first indented.
       * Do not wrap if insufficient room for wrapping (minColumnWidth), or string is manually formatted.
       *
       * @param {string} str
       * @param {number} width
       * @param {number} indent
       * @param {number} [minColumnWidth=40]
       * @return {string}
       *
       */
      wrap(str, width, indent, minColumnWidth = 40) {
        const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
        const manualIndent = new RegExp(`[\\n][${indents}]+`);
        if (str.match(manualIndent)) return str;
        const columnWidth = width - indent;
        if (columnWidth < minColumnWidth) return str;
        const leadingStr = str.slice(0, indent);
        const columnText = str.slice(indent).replace("\r\n", "\n");
        const indentString = " ".repeat(indent);
        const zeroWidthSpace = "\u200B";
        const breaks = `\\s${zeroWidthSpace}`;
        const regex = new RegExp(
          `
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`,
          "g"
        );
        const lines = columnText.match(regex) || [];
        return leadingStr + lines.map((line2, i) => {
          if (line2 === "\n") return "";
          return (i > 0 ? indentString : "") + line2.trimEnd();
        }).join("\n");
      }
    };
    exports.Help = Help2;
  }
});

// packages/cli/node_modules/commander/lib/option.js
var require_option = __commonJS({
  "packages/cli/node_modules/commander/lib/option.js"(exports) {
    var { InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var Option2 = class {
      /**
       * Initialize a new `Option` with the given `flags` and `description`.
       *
       * @param {string} flags
       * @param {string} [description]
       */
      constructor(flags, description) {
        this.flags = flags;
        this.description = description || "";
        this.required = flags.includes("<");
        this.optional = flags.includes("[");
        this.variadic = /\w\.\.\.[>\]]$/.test(flags);
        this.mandatory = false;
        const optionFlags = splitOptionFlags(flags);
        this.short = optionFlags.shortFlag;
        this.long = optionFlags.longFlag;
        this.negate = false;
        if (this.long) {
          this.negate = this.long.startsWith("--no-");
        }
        this.defaultValue = void 0;
        this.defaultValueDescription = void 0;
        this.presetArg = void 0;
        this.envVar = void 0;
        this.parseArg = void 0;
        this.hidden = false;
        this.argChoices = void 0;
        this.conflictsWith = [];
        this.implied = void 0;
      }
      /**
       * Set the default value, and optionally supply the description to be displayed in the help.
       *
       * @param {*} value
       * @param {string} [description]
       * @return {Option}
       */
      default(value, description) {
        this.defaultValue = value;
        this.defaultValueDescription = description;
        return this;
      }
      /**
       * Preset to use when option used without option-argument, especially optional but also boolean and negated.
       * The custom processing (parseArg) is called.
       *
       * @example
       * new Option('--color').default('GREYSCALE').preset('RGB');
       * new Option('--donate [amount]').preset('20').argParser(parseFloat);
       *
       * @param {*} arg
       * @return {Option}
       */
      preset(arg) {
        this.presetArg = arg;
        return this;
      }
      /**
       * Add option name(s) that conflict with this option.
       * An error will be displayed if conflicting options are found during parsing.
       *
       * @example
       * new Option('--rgb').conflicts('cmyk');
       * new Option('--js').conflicts(['ts', 'jsx']);
       *
       * @param {(string | string[])} names
       * @return {Option}
       */
      conflicts(names) {
        this.conflictsWith = this.conflictsWith.concat(names);
        return this;
      }
      /**
       * Specify implied option values for when this option is set and the implied options are not.
       *
       * The custom processing (parseArg) is not called on the implied values.
       *
       * @example
       * program
       *   .addOption(new Option('--log', 'write logging information to file'))
       *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
       *
       * @param {object} impliedOptionValues
       * @return {Option}
       */
      implies(impliedOptionValues) {
        let newImplied = impliedOptionValues;
        if (typeof impliedOptionValues === "string") {
          newImplied = { [impliedOptionValues]: true };
        }
        this.implied = Object.assign(this.implied || {}, newImplied);
        return this;
      }
      /**
       * Set environment variable to check for option value.
       *
       * An environment variable is only used if when processed the current option value is
       * undefined, or the source of the current value is 'default' or 'config' or 'env'.
       *
       * @param {string} name
       * @return {Option}
       */
      env(name) {
        this.envVar = name;
        return this;
      }
      /**
       * Set the custom handler for processing CLI option arguments into option values.
       *
       * @param {Function} [fn]
       * @return {Option}
       */
      argParser(fn) {
        this.parseArg = fn;
        return this;
      }
      /**
       * Whether the option is mandatory and must have a value after parsing.
       *
       * @param {boolean} [mandatory=true]
       * @return {Option}
       */
      makeOptionMandatory(mandatory = true) {
        this.mandatory = !!mandatory;
        return this;
      }
      /**
       * Hide option in help.
       *
       * @param {boolean} [hide=true]
       * @return {Option}
       */
      hideHelp(hide = true) {
        this.hidden = !!hide;
        return this;
      }
      /**
       * @package
       */
      _concatValue(value, previous) {
        if (previous === this.defaultValue || !Array.isArray(previous)) {
          return [value];
        }
        return previous.concat(value);
      }
      /**
       * Only allow option value to be one of choices.
       *
       * @param {string[]} values
       * @return {Option}
       */
      choices(values) {
        this.argChoices = values.slice();
        this.parseArg = (arg, previous) => {
          if (!this.argChoices.includes(arg)) {
            throw new InvalidArgumentError2(
              `Allowed choices are ${this.argChoices.join(", ")}.`
            );
          }
          if (this.variadic) {
            return this._concatValue(arg, previous);
          }
          return arg;
        };
        return this;
      }
      /**
       * Return option name.
       *
       * @return {string}
       */
      name() {
        if (this.long) {
          return this.long.replace(/^--/, "");
        }
        return this.short.replace(/^-/, "");
      }
      /**
       * Return option name, in a camelcase format that can be used
       * as a object attribute key.
       *
       * @return {string}
       */
      attributeName() {
        return camelcase(this.name().replace(/^no-/, ""));
      }
      /**
       * Check if `arg` matches the short or long flag.
       *
       * @param {string} arg
       * @return {boolean}
       * @package
       */
      is(arg) {
        return this.short === arg || this.long === arg;
      }
      /**
       * Return whether a boolean option.
       *
       * Options are one of boolean, negated, required argument, or optional argument.
       *
       * @return {boolean}
       * @package
       */
      isBoolean() {
        return !this.required && !this.optional && !this.negate;
      }
    };
    var DualOptions = class {
      /**
       * @param {Option[]} options
       */
      constructor(options) {
        this.positiveOptions = /* @__PURE__ */ new Map();
        this.negativeOptions = /* @__PURE__ */ new Map();
        this.dualOptions = /* @__PURE__ */ new Set();
        options.forEach((option) => {
          if (option.negate) {
            this.negativeOptions.set(option.attributeName(), option);
          } else {
            this.positiveOptions.set(option.attributeName(), option);
          }
        });
        this.negativeOptions.forEach((value, key) => {
          if (this.positiveOptions.has(key)) {
            this.dualOptions.add(key);
          }
        });
      }
      /**
       * Did the value come from the option, and not from possible matching dual option?
       *
       * @param {*} value
       * @param {Option} option
       * @returns {boolean}
       */
      valueFromOption(value, option) {
        const optionKey = option.attributeName();
        if (!this.dualOptions.has(optionKey)) return true;
        const preset = this.negativeOptions.get(optionKey).presetArg;
        const negativeValue = preset !== void 0 ? preset : false;
        return option.negate === (negativeValue === value);
      }
    };
    function camelcase(str) {
      return str.split("-").reduce((str2, word) => {
        return str2 + word[0].toUpperCase() + word.slice(1);
      });
    }
    function splitOptionFlags(flags) {
      let shortFlag;
      let longFlag;
      const flagParts = flags.split(/[ |,]+/);
      if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
        shortFlag = flagParts.shift();
      longFlag = flagParts.shift();
      if (!shortFlag && /^-[^-]$/.test(longFlag)) {
        shortFlag = longFlag;
        longFlag = void 0;
      }
      return { shortFlag, longFlag };
    }
    exports.Option = Option2;
    exports.DualOptions = DualOptions;
  }
});

// packages/cli/node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS({
  "packages/cli/node_modules/commander/lib/suggestSimilar.js"(exports) {
    var maxDistance = 3;
    function editDistance(a, b) {
      if (Math.abs(a.length - b.length) > maxDistance)
        return Math.max(a.length, b.length);
      const d = [];
      for (let i = 0; i <= a.length; i++) {
        d[i] = [i];
      }
      for (let j = 0; j <= b.length; j++) {
        d[0][j] = j;
      }
      for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
          let cost = 1;
          if (a[i - 1] === b[j - 1]) {
            cost = 0;
          } else {
            cost = 1;
          }
          d[i][j] = Math.min(
            d[i - 1][j] + 1,
            // deletion
            d[i][j - 1] + 1,
            // insertion
            d[i - 1][j - 1] + cost
            // substitution
          );
          if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
            d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
          }
        }
      }
      return d[a.length][b.length];
    }
    function suggestSimilar(word, candidates) {
      if (!candidates || candidates.length === 0) return "";
      candidates = Array.from(new Set(candidates));
      const searchingOptions = word.startsWith("--");
      if (searchingOptions) {
        word = word.slice(2);
        candidates = candidates.map((candidate) => candidate.slice(2));
      }
      let similar = [];
      let bestDistance = maxDistance;
      const minSimilarity = 0.4;
      candidates.forEach((candidate) => {
        if (candidate.length <= 1) return;
        const distance = editDistance(word, candidate);
        const length = Math.max(word.length, candidate.length);
        const similarity = (length - distance) / length;
        if (similarity > minSimilarity) {
          if (distance < bestDistance) {
            bestDistance = distance;
            similar = [candidate];
          } else if (distance === bestDistance) {
            similar.push(candidate);
          }
        }
      });
      similar.sort((a, b) => a.localeCompare(b));
      if (searchingOptions) {
        similar = similar.map((candidate) => `--${candidate}`);
      }
      if (similar.length > 1) {
        return `
(Did you mean one of ${similar.join(", ")}?)`;
      }
      if (similar.length === 1) {
        return `
(Did you mean ${similar[0]}?)`;
      }
      return "";
    }
    exports.suggestSimilar = suggestSimilar;
  }
});

// packages/cli/node_modules/commander/lib/command.js
var require_command = __commonJS({
  "packages/cli/node_modules/commander/lib/command.js"(exports) {
    var EventEmitter = __require("node:events").EventEmitter;
    var childProcess = __require("node:child_process");
    var path = __require("node:path");
    var fs = __require("node:fs");
    var process2 = __require("node:process");
    var { Argument: Argument2, humanReadableArgName } = require_argument();
    var { CommanderError: CommanderError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2, DualOptions } = require_option();
    var { suggestSimilar } = require_suggestSimilar();
    var Command2 = class _Command extends EventEmitter {
      /**
       * Initialize a new `Command`.
       *
       * @param {string} [name]
       */
      constructor(name) {
        super();
        this.commands = [];
        this.options = [];
        this.parent = null;
        this._allowUnknownOption = false;
        this._allowExcessArguments = true;
        this.registeredArguments = [];
        this._args = this.registeredArguments;
        this.args = [];
        this.rawArgs = [];
        this.processedArgs = [];
        this._scriptPath = null;
        this._name = name || "";
        this._optionValues = {};
        this._optionValueSources = {};
        this._storeOptionsAsProperties = false;
        this._actionHandler = null;
        this._executableHandler = false;
        this._executableFile = null;
        this._executableDir = null;
        this._defaultCommandName = null;
        this._exitCallback = null;
        this._aliases = [];
        this._combineFlagAndOptionalValue = true;
        this._description = "";
        this._summary = "";
        this._argsDescription = void 0;
        this._enablePositionalOptions = false;
        this._passThroughOptions = false;
        this._lifeCycleHooks = {};
        this._showHelpAfterError = false;
        this._showSuggestionAfterError = true;
        this._outputConfiguration = {
          writeOut: (str) => process2.stdout.write(str),
          writeErr: (str) => process2.stderr.write(str),
          getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
          getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
          outputError: (str, write) => write(str)
        };
        this._hidden = false;
        this._helpOption = void 0;
        this._addImplicitHelpCommand = void 0;
        this._helpCommand = void 0;
        this._helpConfiguration = {};
      }
      /**
       * Copy settings that are useful to have in common across root command and subcommands.
       *
       * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
       *
       * @param {Command} sourceCommand
       * @return {Command} `this` command for chaining
       */
      copyInheritedSettings(sourceCommand) {
        this._outputConfiguration = sourceCommand._outputConfiguration;
        this._helpOption = sourceCommand._helpOption;
        this._helpCommand = sourceCommand._helpCommand;
        this._helpConfiguration = sourceCommand._helpConfiguration;
        this._exitCallback = sourceCommand._exitCallback;
        this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
        this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
        this._allowExcessArguments = sourceCommand._allowExcessArguments;
        this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
        this._showHelpAfterError = sourceCommand._showHelpAfterError;
        this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
        return this;
      }
      /**
       * @returns {Command[]}
       * @private
       */
      _getCommandAndAncestors() {
        const result = [];
        for (let command = this; command; command = command.parent) {
          result.push(command);
        }
        return result;
      }
      /**
       * Define a command.
       *
       * There are two styles of command: pay attention to where to put the description.
       *
       * @example
       * // Command implemented using action handler (description is supplied separately to `.command`)
       * program
       *   .command('clone <source> [destination]')
       *   .description('clone a repository into a newly created directory')
       *   .action((source, destination) => {
       *     console.log('clone command called');
       *   });
       *
       * // Command implemented using separate executable file (description is second parameter to `.command`)
       * program
       *   .command('start <service>', 'start named service')
       *   .command('stop [service]', 'stop named service, or all if no name supplied');
       *
       * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
       * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
       * @param {object} [execOpts] - configuration options (for executable)
       * @return {Command} returns new command for action handler, or `this` for executable command
       */
      command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
        let desc = actionOptsOrExecDesc;
        let opts = execOpts;
        if (typeof desc === "object" && desc !== null) {
          opts = desc;
          desc = null;
        }
        opts = opts || {};
        const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
        const cmd = this.createCommand(name);
        if (desc) {
          cmd.description(desc);
          cmd._executableHandler = true;
        }
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        cmd._hidden = !!(opts.noHelp || opts.hidden);
        cmd._executableFile = opts.executableFile || null;
        if (args) cmd.arguments(args);
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd.copyInheritedSettings(this);
        if (desc) return this;
        return cmd;
      }
      /**
       * Factory routine to create a new unattached command.
       *
       * See .command() for creating an attached subcommand, which uses this routine to
       * create the command. You can override createCommand to customise subcommands.
       *
       * @param {string} [name]
       * @return {Command} new command
       */
      createCommand(name) {
        return new _Command(name);
      }
      /**
       * You can customise the help with a subclass of Help by overriding createHelp,
       * or by overriding Help properties using configureHelp().
       *
       * @return {Help}
       */
      createHelp() {
        return Object.assign(new Help2(), this.configureHelp());
      }
      /**
       * You can customise the help by overriding Help properties using configureHelp(),
       * or with a subclass of Help by overriding createHelp().
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureHelp(configuration) {
        if (configuration === void 0) return this._helpConfiguration;
        this._helpConfiguration = configuration;
        return this;
      }
      /**
       * The default output goes to stdout and stderr. You can customise this for special
       * applications. You can also customise the display of errors by overriding outputError.
       *
       * The configuration properties are all functions:
       *
       *     // functions to change where being written, stdout and stderr
       *     writeOut(str)
       *     writeErr(str)
       *     // matching functions to specify width for wrapping help
       *     getOutHelpWidth()
       *     getErrHelpWidth()
       *     // functions based on what is being written out
       *     outputError(str, write) // used for displaying errors, and not used for displaying help
       *
       * @param {object} [configuration] - configuration options
       * @return {(Command | object)} `this` command for chaining, or stored configuration
       */
      configureOutput(configuration) {
        if (configuration === void 0) return this._outputConfiguration;
        Object.assign(this._outputConfiguration, configuration);
        return this;
      }
      /**
       * Display the help or a custom message after an error occurs.
       *
       * @param {(boolean|string)} [displayHelp]
       * @return {Command} `this` command for chaining
       */
      showHelpAfterError(displayHelp = true) {
        if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
        this._showHelpAfterError = displayHelp;
        return this;
      }
      /**
       * Display suggestion of similar commands for unknown commands, or options for unknown options.
       *
       * @param {boolean} [displaySuggestion]
       * @return {Command} `this` command for chaining
       */
      showSuggestionAfterError(displaySuggestion = true) {
        this._showSuggestionAfterError = !!displaySuggestion;
        return this;
      }
      /**
       * Add a prepared subcommand.
       *
       * See .command() for creating an attached subcommand which inherits settings from its parent.
       *
       * @param {Command} cmd - new subcommand
       * @param {object} [opts] - configuration options
       * @return {Command} `this` command for chaining
       */
      addCommand(cmd, opts) {
        if (!cmd._name) {
          throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
        }
        opts = opts || {};
        if (opts.isDefault) this._defaultCommandName = cmd._name;
        if (opts.noHelp || opts.hidden) cmd._hidden = true;
        this._registerCommand(cmd);
        cmd.parent = this;
        cmd._checkForBrokenPassThrough();
        return this;
      }
      /**
       * Factory routine to create a new unattached argument.
       *
       * See .argument() for creating an attached argument, which uses this routine to
       * create the argument. You can override createArgument to return a custom argument.
       *
       * @param {string} name
       * @param {string} [description]
       * @return {Argument} new argument
       */
      createArgument(name, description) {
        return new Argument2(name, description);
      }
      /**
       * Define argument syntax for command.
       *
       * The default is that the argument is required, and you can explicitly
       * indicate this with <> around the name. Put [] around the name for an optional argument.
       *
       * @example
       * program.argument('<input-file>');
       * program.argument('[output-file]');
       *
       * @param {string} name
       * @param {string} [description]
       * @param {(Function|*)} [fn] - custom argument processing function
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      argument(name, description, fn, defaultValue) {
        const argument = this.createArgument(name, description);
        if (typeof fn === "function") {
          argument.default(defaultValue).argParser(fn);
        } else {
          argument.default(fn);
        }
        this.addArgument(argument);
        return this;
      }
      /**
       * Define argument syntax for command, adding multiple at once (without descriptions).
       *
       * See also .argument().
       *
       * @example
       * program.arguments('<cmd> [env]');
       *
       * @param {string} names
       * @return {Command} `this` command for chaining
       */
      arguments(names) {
        names.trim().split(/ +/).forEach((detail) => {
          this.argument(detail);
        });
        return this;
      }
      /**
       * Define argument syntax for command, adding a prepared argument.
       *
       * @param {Argument} argument
       * @return {Command} `this` command for chaining
       */
      addArgument(argument) {
        const previousArgument = this.registeredArguments.slice(-1)[0];
        if (previousArgument && previousArgument.variadic) {
          throw new Error(
            `only the last argument can be variadic '${previousArgument.name()}'`
          );
        }
        if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
          throw new Error(
            `a default value for a required argument is never used: '${argument.name()}'`
          );
        }
        this.registeredArguments.push(argument);
        return this;
      }
      /**
       * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
       *
       * @example
       *    program.helpCommand('help [cmd]');
       *    program.helpCommand('help [cmd]', 'show help');
       *    program.helpCommand(false); // suppress default help command
       *    program.helpCommand(true); // add help command even if no subcommands
       *
       * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
       * @param {string} [description] - custom description
       * @return {Command} `this` command for chaining
       */
      helpCommand(enableOrNameAndArgs, description) {
        if (typeof enableOrNameAndArgs === "boolean") {
          this._addImplicitHelpCommand = enableOrNameAndArgs;
          return this;
        }
        enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
        const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
        const helpDescription = description ?? "display help for command";
        const helpCommand = this.createCommand(helpName);
        helpCommand.helpOption(false);
        if (helpArgs) helpCommand.arguments(helpArgs);
        if (helpDescription) helpCommand.description(helpDescription);
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Add prepared custom help command.
       *
       * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
       * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
       * @return {Command} `this` command for chaining
       */
      addHelpCommand(helpCommand, deprecatedDescription) {
        if (typeof helpCommand !== "object") {
          this.helpCommand(helpCommand, deprecatedDescription);
          return this;
        }
        this._addImplicitHelpCommand = true;
        this._helpCommand = helpCommand;
        return this;
      }
      /**
       * Lazy create help command.
       *
       * @return {(Command|null)}
       * @package
       */
      _getHelpCommand() {
        const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
        if (hasImplicitHelpCommand) {
          if (this._helpCommand === void 0) {
            this.helpCommand(void 0, void 0);
          }
          return this._helpCommand;
        }
        return null;
      }
      /**
       * Add hook for life cycle event.
       *
       * @param {string} event
       * @param {Function} listener
       * @return {Command} `this` command for chaining
       */
      hook(event, listener) {
        const allowedValues = ["preSubcommand", "preAction", "postAction"];
        if (!allowedValues.includes(event)) {
          throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        if (this._lifeCycleHooks[event]) {
          this._lifeCycleHooks[event].push(listener);
        } else {
          this._lifeCycleHooks[event] = [listener];
        }
        return this;
      }
      /**
       * Register callback to use as replacement for calling process.exit.
       *
       * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
       * @return {Command} `this` command for chaining
       */
      exitOverride(fn) {
        if (fn) {
          this._exitCallback = fn;
        } else {
          this._exitCallback = (err) => {
            if (err.code !== "commander.executeSubCommandAsync") {
              throw err;
            } else {
            }
          };
        }
        return this;
      }
      /**
       * Call process.exit, and _exitCallback if defined.
       *
       * @param {number} exitCode exit code for using with process.exit
       * @param {string} code an id string representing the error
       * @param {string} message human-readable description of the error
       * @return never
       * @private
       */
      _exit(exitCode, code, message) {
        if (this._exitCallback) {
          this._exitCallback(new CommanderError2(exitCode, code, message));
        }
        process2.exit(exitCode);
      }
      /**
       * Register callback `fn` for the command.
       *
       * @example
       * program
       *   .command('serve')
       *   .description('start service')
       *   .action(function() {
       *      // do work here
       *   });
       *
       * @param {Function} fn
       * @return {Command} `this` command for chaining
       */
      action(fn) {
        const listener = (args) => {
          const expectedArgsCount = this.registeredArguments.length;
          const actionArgs = args.slice(0, expectedArgsCount);
          if (this._storeOptionsAsProperties) {
            actionArgs[expectedArgsCount] = this;
          } else {
            actionArgs[expectedArgsCount] = this.opts();
          }
          actionArgs.push(this);
          return fn.apply(this, actionArgs);
        };
        this._actionHandler = listener;
        return this;
      }
      /**
       * Factory routine to create a new unattached option.
       *
       * See .option() for creating an attached option, which uses this routine to
       * create the option. You can override createOption to return a custom option.
       *
       * @param {string} flags
       * @param {string} [description]
       * @return {Option} new option
       */
      createOption(flags, description) {
        return new Option2(flags, description);
      }
      /**
       * Wrap parseArgs to catch 'commander.invalidArgument'.
       *
       * @param {(Option | Argument)} target
       * @param {string} value
       * @param {*} previous
       * @param {string} invalidArgumentMessage
       * @private
       */
      _callParseArg(target, value, previous, invalidArgumentMessage) {
        try {
          return target.parseArg(value, previous);
        } catch (err) {
          if (err.code === "commander.invalidArgument") {
            const message = `${invalidArgumentMessage} ${err.message}`;
            this.error(message, { exitCode: err.exitCode, code: err.code });
          }
          throw err;
        }
      }
      /**
       * Check for option flag conflicts.
       * Register option if no conflicts found, or throw on conflict.
       *
       * @param {Option} option
       * @private
       */
      _registerOption(option) {
        const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
        if (matchingOption) {
          const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
          throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
        }
        this.options.push(option);
      }
      /**
       * Check for command name and alias conflicts with existing commands.
       * Register command if no conflicts found, or throw on conflict.
       *
       * @param {Command} command
       * @private
       */
      _registerCommand(command) {
        const knownBy = (cmd) => {
          return [cmd.name()].concat(cmd.aliases());
        };
        const alreadyUsed = knownBy(command).find(
          (name) => this._findCommand(name)
        );
        if (alreadyUsed) {
          const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
          const newCmd = knownBy(command).join("|");
          throw new Error(
            `cannot add command '${newCmd}' as already have command '${existingCmd}'`
          );
        }
        this.commands.push(command);
      }
      /**
       * Add an option.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addOption(option) {
        this._registerOption(option);
        const oname = option.name();
        const name = option.attributeName();
        if (option.negate) {
          const positiveLongFlag = option.long.replace(/^--no-/, "--");
          if (!this._findOption(positiveLongFlag)) {
            this.setOptionValueWithSource(
              name,
              option.defaultValue === void 0 ? true : option.defaultValue,
              "default"
            );
          }
        } else if (option.defaultValue !== void 0) {
          this.setOptionValueWithSource(name, option.defaultValue, "default");
        }
        const handleOptionValue = (val, invalidValueMessage, valueSource) => {
          if (val == null && option.presetArg !== void 0) {
            val = option.presetArg;
          }
          const oldValue = this.getOptionValue(name);
          if (val !== null && option.parseArg) {
            val = this._callParseArg(option, val, oldValue, invalidValueMessage);
          } else if (val !== null && option.variadic) {
            val = option._concatValue(val, oldValue);
          }
          if (val == null) {
            if (option.negate) {
              val = false;
            } else if (option.isBoolean() || option.optional) {
              val = true;
            } else {
              val = "";
            }
          }
          this.setOptionValueWithSource(name, val, valueSource);
        };
        this.on("option:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "cli");
        });
        if (option.envVar) {
          this.on("optionEnv:" + oname, (val) => {
            const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
            handleOptionValue(val, invalidValueMessage, "env");
          });
        }
        return this;
      }
      /**
       * Internal implementation shared by .option() and .requiredOption()
       *
       * @return {Command} `this` command for chaining
       * @private
       */
      _optionEx(config, flags, description, fn, defaultValue) {
        if (typeof flags === "object" && flags instanceof Option2) {
          throw new Error(
            "To add an Option object use addOption() instead of option() or requiredOption()"
          );
        }
        const option = this.createOption(flags, description);
        option.makeOptionMandatory(!!config.mandatory);
        if (typeof fn === "function") {
          option.default(defaultValue).argParser(fn);
        } else if (fn instanceof RegExp) {
          const regex = fn;
          fn = (val, def) => {
            const m = regex.exec(val);
            return m ? m[0] : def;
          };
          option.default(defaultValue).argParser(fn);
        } else {
          option.default(fn);
        }
        return this.addOption(option);
      }
      /**
       * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
       * option-argument is indicated by `<>` and an optional option-argument by `[]`.
       *
       * See the README for more details, and see also addOption() and requiredOption().
       *
       * @example
       * program
       *     .option('-p, --pepper', 'add pepper')
       *     .option('-p, --pizza-type <TYPE>', 'type of pizza') // required option-argument
       *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
       *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      option(flags, description, parseArg, defaultValue) {
        return this._optionEx({}, flags, description, parseArg, defaultValue);
      }
      /**
       * Add a required option which must have a value after parsing. This usually means
       * the option must be specified on the command line. (Otherwise the same as .option().)
       *
       * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
       *
       * @param {string} flags
       * @param {string} [description]
       * @param {(Function|*)} [parseArg] - custom option processing function or default value
       * @param {*} [defaultValue]
       * @return {Command} `this` command for chaining
       */
      requiredOption(flags, description, parseArg, defaultValue) {
        return this._optionEx(
          { mandatory: true },
          flags,
          description,
          parseArg,
          defaultValue
        );
      }
      /**
       * Alter parsing of short flags with optional values.
       *
       * @example
       * // for `.option('-f,--flag [value]'):
       * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
       * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
       *
       * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
       * @return {Command} `this` command for chaining
       */
      combineFlagAndOptionalValue(combine = true) {
        this._combineFlagAndOptionalValue = !!combine;
        return this;
      }
      /**
       * Allow unknown options on the command line.
       *
       * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
       * @return {Command} `this` command for chaining
       */
      allowUnknownOption(allowUnknown = true) {
        this._allowUnknownOption = !!allowUnknown;
        return this;
      }
      /**
       * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
       *
       * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
       * @return {Command} `this` command for chaining
       */
      allowExcessArguments(allowExcess = true) {
        this._allowExcessArguments = !!allowExcess;
        return this;
      }
      /**
       * Enable positional options. Positional means global options are specified before subcommands which lets
       * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
       * The default behaviour is non-positional and global options may appear anywhere on the command line.
       *
       * @param {boolean} [positional]
       * @return {Command} `this` command for chaining
       */
      enablePositionalOptions(positional = true) {
        this._enablePositionalOptions = !!positional;
        return this;
      }
      /**
       * Pass through options that come after command-arguments rather than treat them as command-options,
       * so actual command-options come before command-arguments. Turning this on for a subcommand requires
       * positional options to have been enabled on the program (parent commands).
       * The default behaviour is non-positional and options may appear before or after command-arguments.
       *
       * @param {boolean} [passThrough] for unknown options.
       * @return {Command} `this` command for chaining
       */
      passThroughOptions(passThrough = true) {
        this._passThroughOptions = !!passThrough;
        this._checkForBrokenPassThrough();
        return this;
      }
      /**
       * @private
       */
      _checkForBrokenPassThrough() {
        if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
          throw new Error(
            `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
          );
        }
      }
      /**
       * Whether to store option values as properties on command object,
       * or store separately (specify false). In both cases the option values can be accessed using .opts().
       *
       * @param {boolean} [storeAsProperties=true]
       * @return {Command} `this` command for chaining
       */
      storeOptionsAsProperties(storeAsProperties = true) {
        if (this.options.length) {
          throw new Error("call .storeOptionsAsProperties() before adding options");
        }
        if (Object.keys(this._optionValues).length) {
          throw new Error(
            "call .storeOptionsAsProperties() before setting option values"
          );
        }
        this._storeOptionsAsProperties = !!storeAsProperties;
        return this;
      }
      /**
       * Retrieve option value.
       *
       * @param {string} key
       * @return {object} value
       */
      getOptionValue(key) {
        if (this._storeOptionsAsProperties) {
          return this[key];
        }
        return this._optionValues[key];
      }
      /**
       * Store option value.
       *
       * @param {string} key
       * @param {object} value
       * @return {Command} `this` command for chaining
       */
      setOptionValue(key, value) {
        return this.setOptionValueWithSource(key, value, void 0);
      }
      /**
       * Store option value and where the value came from.
       *
       * @param {string} key
       * @param {object} value
       * @param {string} source - expected values are default/config/env/cli/implied
       * @return {Command} `this` command for chaining
       */
      setOptionValueWithSource(key, value, source) {
        if (this._storeOptionsAsProperties) {
          this[key] = value;
        } else {
          this._optionValues[key] = value;
        }
        this._optionValueSources[key] = source;
        return this;
      }
      /**
       * Get source of option value.
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSource(key) {
        return this._optionValueSources[key];
      }
      /**
       * Get source of option value. See also .optsWithGlobals().
       * Expected values are default | config | env | cli | implied
       *
       * @param {string} key
       * @return {string}
       */
      getOptionValueSourceWithGlobals(key) {
        let source;
        this._getCommandAndAncestors().forEach((cmd) => {
          if (cmd.getOptionValueSource(key) !== void 0) {
            source = cmd.getOptionValueSource(key);
          }
        });
        return source;
      }
      /**
       * Get user arguments from implied or explicit arguments.
       * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
       *
       * @private
       */
      _prepareUserArgs(argv, parseOptions) {
        if (argv !== void 0 && !Array.isArray(argv)) {
          throw new Error("first parameter to parse must be array or undefined");
        }
        parseOptions = parseOptions || {};
        if (argv === void 0 && parseOptions.from === void 0) {
          if (process2.versions?.electron) {
            parseOptions.from = "electron";
          }
          const execArgv = process2.execArgv ?? [];
          if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
            parseOptions.from = "eval";
          }
        }
        if (argv === void 0) {
          argv = process2.argv;
        }
        this.rawArgs = argv.slice();
        let userArgs;
        switch (parseOptions.from) {
          case void 0:
          case "node":
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
            break;
          case "electron":
            if (process2.defaultApp) {
              this._scriptPath = argv[1];
              userArgs = argv.slice(2);
            } else {
              userArgs = argv.slice(1);
            }
            break;
          case "user":
            userArgs = argv.slice(0);
            break;
          case "eval":
            userArgs = argv.slice(1);
            break;
          default:
            throw new Error(
              `unexpected parse option { from: '${parseOptions.from}' }`
            );
        }
        if (!this._name && this._scriptPath)
          this.nameFromFilename(this._scriptPath);
        this._name = this._name || "program";
        return userArgs;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Use parseAsync instead of parse if any of your action handlers are async.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * program.parse(); // parse process.argv and auto-detect electron and special node flags
       * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
       * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv] - optional, defaults to process.argv
       * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
       * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
       * @return {Command} `this` command for chaining
       */
      parse(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Parse `argv`, setting options and invoking commands when defined.
       *
       * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
       *
       * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
       * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
       * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
       * - `'user'`: just user arguments
       *
       * @example
       * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
       * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
       * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
       *
       * @param {string[]} [argv]
       * @param {object} [parseOptions]
       * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
       * @return {Promise}
       */
      async parseAsync(argv, parseOptions) {
        const userArgs = this._prepareUserArgs(argv, parseOptions);
        await this._parseCommand([], userArgs);
        return this;
      }
      /**
       * Execute a sub-command executable.
       *
       * @private
       */
      _executeSubCommand(subcommand, args) {
        args = args.slice();
        let launchWithNode = false;
        const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
        function findFile(baseDir, baseName) {
          const localBin = path.resolve(baseDir, baseName);
          if (fs.existsSync(localBin)) return localBin;
          if (sourceExt.includes(path.extname(baseName))) return void 0;
          const foundExt = sourceExt.find(
            (ext) => fs.existsSync(`${localBin}${ext}`)
          );
          if (foundExt) return `${localBin}${foundExt}`;
          return void 0;
        }
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
        let executableDir = this._executableDir || "";
        if (this._scriptPath) {
          let resolvedScriptPath;
          try {
            resolvedScriptPath = fs.realpathSync(this._scriptPath);
          } catch (err) {
            resolvedScriptPath = this._scriptPath;
          }
          executableDir = path.resolve(
            path.dirname(resolvedScriptPath),
            executableDir
          );
        }
        if (executableDir) {
          let localFile = findFile(executableDir, executableFile);
          if (!localFile && !subcommand._executableFile && this._scriptPath) {
            const legacyName = path.basename(
              this._scriptPath,
              path.extname(this._scriptPath)
            );
            if (legacyName !== this._name) {
              localFile = findFile(
                executableDir,
                `${legacyName}-${subcommand._name}`
              );
            }
          }
          executableFile = localFile || executableFile;
        }
        launchWithNode = sourceExt.includes(path.extname(executableFile));
        let proc;
        if (process2.platform !== "win32") {
          if (launchWithNode) {
            args.unshift(executableFile);
            args = incrementNodeInspectorPort(process2.execArgv).concat(args);
            proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
          } else {
            proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
          }
        } else {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
        }
        if (!proc.killed) {
          const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
          signals.forEach((signal) => {
            process2.on(signal, () => {
              if (proc.killed === false && proc.exitCode === null) {
                proc.kill(signal);
              }
            });
          });
        }
        const exitCallback = this._exitCallback;
        proc.on("close", (code) => {
          code = code ?? 1;
          if (!exitCallback) {
            process2.exit(code);
          } else {
            exitCallback(
              new CommanderError2(
                code,
                "commander.executeSubCommandAsync",
                "(close)"
              )
            );
          }
        });
        proc.on("error", (err) => {
          if (err.code === "ENOENT") {
            const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
            const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
            throw new Error(executableMissing);
          } else if (err.code === "EACCES") {
            throw new Error(`'${executableFile}' not executable`);
          }
          if (!exitCallback) {
            process2.exit(1);
          } else {
            const wrappedError = new CommanderError2(
              1,
              "commander.executeSubCommandAsync",
              "(error)"
            );
            wrappedError.nestedError = err;
            exitCallback(wrappedError);
          }
        });
        this.runningCommand = proc;
      }
      /**
       * @private
       */
      _dispatchSubcommand(commandName, operands, unknown) {
        const subCommand = this._findCommand(commandName);
        if (!subCommand) this.help({ error: true });
        let promiseChain;
        promiseChain = this._chainOrCallSubCommandHook(
          promiseChain,
          subCommand,
          "preSubcommand"
        );
        promiseChain = this._chainOrCall(promiseChain, () => {
          if (subCommand._executableHandler) {
            this._executeSubCommand(subCommand, operands.concat(unknown));
          } else {
            return subCommand._parseCommand(operands, unknown);
          }
        });
        return promiseChain;
      }
      /**
       * Invoke help directly if possible, or dispatch if necessary.
       * e.g. help foo
       *
       * @private
       */
      _dispatchHelpCommand(subcommandName) {
        if (!subcommandName) {
          this.help();
        }
        const subCommand = this._findCommand(subcommandName);
        if (subCommand && !subCommand._executableHandler) {
          subCommand.help();
        }
        return this._dispatchSubcommand(
          subcommandName,
          [],
          [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
        );
      }
      /**
       * Check this.args against expected this.registeredArguments.
       *
       * @private
       */
      _checkNumberOfArguments() {
        this.registeredArguments.forEach((arg, i) => {
          if (arg.required && this.args[i] == null) {
            this.missingArgument(arg.name());
          }
        });
        if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
          return;
        }
        if (this.args.length > this.registeredArguments.length) {
          this._excessArguments(this.args);
        }
      }
      /**
       * Process this.args using this.registeredArguments and save as this.processedArgs!
       *
       * @private
       */
      _processArguments() {
        const myParseArg = (argument, value, previous) => {
          let parsedValue = value;
          if (value !== null && argument.parseArg) {
            const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
            parsedValue = this._callParseArg(
              argument,
              value,
              previous,
              invalidValueMessage
            );
          }
          return parsedValue;
        };
        this._checkNumberOfArguments();
        const processedArgs = [];
        this.registeredArguments.forEach((declaredArg, index) => {
          let value = declaredArg.defaultValue;
          if (declaredArg.variadic) {
            if (index < this.args.length) {
              value = this.args.slice(index);
              if (declaredArg.parseArg) {
                value = value.reduce((processed, v) => {
                  return myParseArg(declaredArg, v, processed);
                }, declaredArg.defaultValue);
              }
            } else if (value === void 0) {
              value = [];
            }
          } else if (index < this.args.length) {
            value = this.args[index];
            if (declaredArg.parseArg) {
              value = myParseArg(declaredArg, value, declaredArg.defaultValue);
            }
          }
          processedArgs[index] = value;
        });
        this.processedArgs = processedArgs;
      }
      /**
       * Once we have a promise we chain, but call synchronously until then.
       *
       * @param {(Promise|undefined)} promise
       * @param {Function} fn
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCall(promise, fn) {
        if (promise && promise.then && typeof promise.then === "function") {
          return promise.then(() => fn());
        }
        return fn();
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallHooks(promise, event) {
        let result = promise;
        const hooks = [];
        this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
          hookedCommand._lifeCycleHooks[event].forEach((callback) => {
            hooks.push({ hookedCommand, callback });
          });
        });
        if (event === "postAction") {
          hooks.reverse();
        }
        hooks.forEach((hookDetail) => {
          result = this._chainOrCall(result, () => {
            return hookDetail.callback(hookDetail.hookedCommand, this);
          });
        });
        return result;
      }
      /**
       *
       * @param {(Promise|undefined)} promise
       * @param {Command} subCommand
       * @param {string} event
       * @return {(Promise|undefined)}
       * @private
       */
      _chainOrCallSubCommandHook(promise, subCommand, event) {
        let result = promise;
        if (this._lifeCycleHooks[event] !== void 0) {
          this._lifeCycleHooks[event].forEach((hook) => {
            result = this._chainOrCall(result, () => {
              return hook(this, subCommand);
            });
          });
        }
        return result;
      }
      /**
       * Process arguments in context of this command.
       * Returns action result, in case it is a promise.
       *
       * @private
       */
      _parseCommand(operands, unknown) {
        const parsed = this.parseOptions(unknown);
        this._parseOptionsEnv();
        this._parseOptionsImplied();
        operands = operands.concat(parsed.operands);
        unknown = parsed.unknown;
        this.args = operands.concat(unknown);
        if (operands && this._findCommand(operands[0])) {
          return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
        }
        if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
          return this._dispatchHelpCommand(operands[1]);
        }
        if (this._defaultCommandName) {
          this._outputHelpIfRequested(unknown);
          return this._dispatchSubcommand(
            this._defaultCommandName,
            operands,
            unknown
          );
        }
        if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
          this.help({ error: true });
        }
        this._outputHelpIfRequested(parsed.unknown);
        this._checkForMissingMandatoryOptions();
        this._checkForConflictingOptions();
        const checkForUnknownOptions = () => {
          if (parsed.unknown.length > 0) {
            this.unknownOption(parsed.unknown[0]);
          }
        };
        const commandEvent = `command:${this.name()}`;
        if (this._actionHandler) {
          checkForUnknownOptions();
          this._processArguments();
          let promiseChain;
          promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
          promiseChain = this._chainOrCall(
            promiseChain,
            () => this._actionHandler(this.processedArgs)
          );
          if (this.parent) {
            promiseChain = this._chainOrCall(promiseChain, () => {
              this.parent.emit(commandEvent, operands, unknown);
            });
          }
          promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
          return promiseChain;
        }
        if (this.parent && this.parent.listenerCount(commandEvent)) {
          checkForUnknownOptions();
          this._processArguments();
          this.parent.emit(commandEvent, operands, unknown);
        } else if (operands.length) {
          if (this._findCommand("*")) {
            return this._dispatchSubcommand("*", operands, unknown);
          }
          if (this.listenerCount("command:*")) {
            this.emit("command:*", operands, unknown);
          } else if (this.commands.length) {
            this.unknownCommand();
          } else {
            checkForUnknownOptions();
            this._processArguments();
          }
        } else if (this.commands.length) {
          checkForUnknownOptions();
          this.help({ error: true });
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      }
      /**
       * Find matching command.
       *
       * @private
       * @return {Command | undefined}
       */
      _findCommand(name) {
        if (!name) return void 0;
        return this.commands.find(
          (cmd) => cmd._name === name || cmd._aliases.includes(name)
        );
      }
      /**
       * Return an option matching `arg` if any.
       *
       * @param {string} arg
       * @return {Option}
       * @package
       */
      _findOption(arg) {
        return this.options.find((option) => option.is(arg));
      }
      /**
       * Display an error message if a mandatory option does not have a value.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForMissingMandatoryOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd.options.forEach((anOption) => {
            if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
              cmd.missingMandatoryOptionValue(anOption);
            }
          });
        });
      }
      /**
       * Display an error message if conflicting options are used together in this.
       *
       * @private
       */
      _checkForConflictingLocalOptions() {
        const definedNonDefaultOptions = this.options.filter((option) => {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === void 0) {
            return false;
          }
          return this.getOptionValueSource(optionKey) !== "default";
        });
        const optionsWithConflicting = definedNonDefaultOptions.filter(
          (option) => option.conflictsWith.length > 0
        );
        optionsWithConflicting.forEach((option) => {
          const conflictingAndDefined = definedNonDefaultOptions.find(
            (defined) => option.conflictsWith.includes(defined.attributeName())
          );
          if (conflictingAndDefined) {
            this._conflictingOption(option, conflictingAndDefined);
          }
        });
      }
      /**
       * Display an error message if conflicting options are used together.
       * Called after checking for help flags in leaf subcommand.
       *
       * @private
       */
      _checkForConflictingOptions() {
        this._getCommandAndAncestors().forEach((cmd) => {
          cmd._checkForConflictingLocalOptions();
        });
      }
      /**
       * Parse options from `argv` removing known options,
       * and return argv split into operands and unknown arguments.
       *
       * Examples:
       *
       *     argv => operands, unknown
       *     --known kkk op => [op], []
       *     op --known kkk => [op], []
       *     sub --unknown uuu op => [sub], [--unknown uuu op]
       *     sub -- --unknown uuu op => [sub --unknown uuu op], []
       *
       * @param {string[]} argv
       * @return {{operands: string[], unknown: string[]}}
       */
      parseOptions(argv) {
        const operands = [];
        const unknown = [];
        let dest = operands;
        const args = argv.slice();
        function maybeOption(arg) {
          return arg.length > 1 && arg[0] === "-";
        }
        let activeVariadicOption = null;
        while (args.length) {
          const arg = args.shift();
          if (arg === "--") {
            if (dest === unknown) dest.push(arg);
            dest.push(...args);
            break;
          }
          if (activeVariadicOption && !maybeOption(arg)) {
            this.emit(`option:${activeVariadicOption.name()}`, arg);
            continue;
          }
          activeVariadicOption = null;
          if (maybeOption(arg)) {
            const option = this._findOption(arg);
            if (option) {
              if (option.required) {
                const value = args.shift();
                if (value === void 0) this.optionMissingArgument(option);
                this.emit(`option:${option.name()}`, value);
              } else if (option.optional) {
                let value = null;
                if (args.length > 0 && !maybeOption(args[0])) {
                  value = args.shift();
                }
                this.emit(`option:${option.name()}`, value);
              } else {
                this.emit(`option:${option.name()}`);
              }
              activeVariadicOption = option.variadic ? option : null;
              continue;
            }
          }
          if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
            const option = this._findOption(`-${arg[1]}`);
            if (option) {
              if (option.required || option.optional && this._combineFlagAndOptionalValue) {
                this.emit(`option:${option.name()}`, arg.slice(2));
              } else {
                this.emit(`option:${option.name()}`);
                args.unshift(`-${arg.slice(2)}`);
              }
              continue;
            }
          }
          if (/^--[^=]+=/.test(arg)) {
            const index = arg.indexOf("=");
            const option = this._findOption(arg.slice(0, index));
            if (option && (option.required || option.optional)) {
              this.emit(`option:${option.name()}`, arg.slice(index + 1));
              continue;
            }
          }
          if (maybeOption(arg)) {
            dest = unknown;
          }
          if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
            if (this._findCommand(arg)) {
              operands.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
              operands.push(arg);
              if (args.length > 0) operands.push(...args);
              break;
            } else if (this._defaultCommandName) {
              unknown.push(arg);
              if (args.length > 0) unknown.push(...args);
              break;
            }
          }
          if (this._passThroughOptions) {
            dest.push(arg);
            if (args.length > 0) dest.push(...args);
            break;
          }
          dest.push(arg);
        }
        return { operands, unknown };
      }
      /**
       * Return an object containing local option values as key-value pairs.
       *
       * @return {object}
       */
      opts() {
        if (this._storeOptionsAsProperties) {
          const result = {};
          const len = this.options.length;
          for (let i = 0; i < len; i++) {
            const key = this.options[i].attributeName();
            result[key] = key === this._versionOptionName ? this._version : this[key];
          }
          return result;
        }
        return this._optionValues;
      }
      /**
       * Return an object containing merged local and global option values as key-value pairs.
       *
       * @return {object}
       */
      optsWithGlobals() {
        return this._getCommandAndAncestors().reduce(
          (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
          {}
        );
      }
      /**
       * Display error message and exit (or call exitOverride).
       *
       * @param {string} message
       * @param {object} [errorOptions]
       * @param {string} [errorOptions.code] - an id string representing the error
       * @param {number} [errorOptions.exitCode] - used with process.exit
       */
      error(message, errorOptions) {
        this._outputConfiguration.outputError(
          `${message}
`,
          this._outputConfiguration.writeErr
        );
        if (typeof this._showHelpAfterError === "string") {
          this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
        } else if (this._showHelpAfterError) {
          this._outputConfiguration.writeErr("\n");
          this.outputHelp({ error: true });
        }
        const config = errorOptions || {};
        const exitCode = config.exitCode || 1;
        const code = config.code || "commander.error";
        this._exit(exitCode, code, message);
      }
      /**
       * Apply any option related environment variables, if option does
       * not have a value from cli or client code.
       *
       * @private
       */
      _parseOptionsEnv() {
        this.options.forEach((option) => {
          if (option.envVar && option.envVar in process2.env) {
            const optionKey = option.attributeName();
            if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
              this.getOptionValueSource(optionKey)
            )) {
              if (option.required || option.optional) {
                this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
              } else {
                this.emit(`optionEnv:${option.name()}`);
              }
            }
          }
        });
      }
      /**
       * Apply any implied option values, if option is undefined or default value.
       *
       * @private
       */
      _parseOptionsImplied() {
        const dualHelper = new DualOptions(this.options);
        const hasCustomOptionValue = (optionKey) => {
          return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
        };
        this.options.filter(
          (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
            this.getOptionValue(option.attributeName()),
            option
          )
        ).forEach((option) => {
          Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
            this.setOptionValueWithSource(
              impliedKey,
              option.implied[impliedKey],
              "implied"
            );
          });
        });
      }
      /**
       * Argument `name` is missing.
       *
       * @param {string} name
       * @private
       */
      missingArgument(name) {
        const message = `error: missing required argument '${name}'`;
        this.error(message, { code: "commander.missingArgument" });
      }
      /**
       * `Option` is missing an argument.
       *
       * @param {Option} option
       * @private
       */
      optionMissingArgument(option) {
        const message = `error: option '${option.flags}' argument missing`;
        this.error(message, { code: "commander.optionMissingArgument" });
      }
      /**
       * `Option` does not have a value, and is a mandatory option.
       *
       * @param {Option} option
       * @private
       */
      missingMandatoryOptionValue(option) {
        const message = `error: required option '${option.flags}' not specified`;
        this.error(message, { code: "commander.missingMandatoryOptionValue" });
      }
      /**
       * `Option` conflicts with another option.
       *
       * @param {Option} option
       * @param {Option} conflictingOption
       * @private
       */
      _conflictingOption(option, conflictingOption) {
        const findBestOptionFromValue = (option2) => {
          const optionKey = option2.attributeName();
          const optionValue = this.getOptionValue(optionKey);
          const negativeOption = this.options.find(
            (target) => target.negate && optionKey === target.attributeName()
          );
          const positiveOption = this.options.find(
            (target) => !target.negate && optionKey === target.attributeName()
          );
          if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
            return negativeOption;
          }
          return positiveOption || option2;
        };
        const getErrorMessage = (option2) => {
          const bestOption = findBestOptionFromValue(option2);
          const optionKey = bestOption.attributeName();
          const source = this.getOptionValueSource(optionKey);
          if (source === "env") {
            return `environment variable '${bestOption.envVar}'`;
          }
          return `option '${bestOption.flags}'`;
        };
        const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
        this.error(message, { code: "commander.conflictingOption" });
      }
      /**
       * Unknown option `flag`.
       *
       * @param {string} flag
       * @private
       */
      unknownOption(flag) {
        if (this._allowUnknownOption) return;
        let suggestion = "";
        if (flag.startsWith("--") && this._showSuggestionAfterError) {
          let candidateFlags = [];
          let command = this;
          do {
            const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
            candidateFlags = candidateFlags.concat(moreFlags);
            command = command.parent;
          } while (command && !command._enablePositionalOptions);
          suggestion = suggestSimilar(flag, candidateFlags);
        }
        const message = `error: unknown option '${flag}'${suggestion}`;
        this.error(message, { code: "commander.unknownOption" });
      }
      /**
       * Excess arguments, more than expected.
       *
       * @param {string[]} receivedArgs
       * @private
       */
      _excessArguments(receivedArgs) {
        if (this._allowExcessArguments) return;
        const expected = this.registeredArguments.length;
        const s = expected === 1 ? "" : "s";
        const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
        const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
        this.error(message, { code: "commander.excessArguments" });
      }
      /**
       * Unknown command.
       *
       * @private
       */
      unknownCommand() {
        const unknownName = this.args[0];
        let suggestion = "";
        if (this._showSuggestionAfterError) {
          const candidateNames = [];
          this.createHelp().visibleCommands(this).forEach((command) => {
            candidateNames.push(command.name());
            if (command.alias()) candidateNames.push(command.alias());
          });
          suggestion = suggestSimilar(unknownName, candidateNames);
        }
        const message = `error: unknown command '${unknownName}'${suggestion}`;
        this.error(message, { code: "commander.unknownCommand" });
      }
      /**
       * Get or set the program version.
       *
       * This method auto-registers the "-V, --version" option which will print the version number.
       *
       * You can optionally supply the flags and description to override the defaults.
       *
       * @param {string} [str]
       * @param {string} [flags]
       * @param {string} [description]
       * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
       */
      version(str, flags, description) {
        if (str === void 0) return this._version;
        this._version = str;
        flags = flags || "-V, --version";
        description = description || "output the version number";
        const versionOption = this.createOption(flags, description);
        this._versionOptionName = versionOption.attributeName();
        this._registerOption(versionOption);
        this.on("option:" + versionOption.name(), () => {
          this._outputConfiguration.writeOut(`${str}
`);
          this._exit(0, "commander.version", str);
        });
        return this;
      }
      /**
       * Set the description.
       *
       * @param {string} [str]
       * @param {object} [argsDescription]
       * @return {(string|Command)}
       */
      description(str, argsDescription) {
        if (str === void 0 && argsDescription === void 0)
          return this._description;
        this._description = str;
        if (argsDescription) {
          this._argsDescription = argsDescription;
        }
        return this;
      }
      /**
       * Set the summary. Used when listed as subcommand of parent.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      summary(str) {
        if (str === void 0) return this._summary;
        this._summary = str;
        return this;
      }
      /**
       * Set an alias for the command.
       *
       * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
       *
       * @param {string} [alias]
       * @return {(string|Command)}
       */
      alias(alias) {
        if (alias === void 0) return this._aliases[0];
        let command = this;
        if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
          command = this.commands[this.commands.length - 1];
        }
        if (alias === command._name)
          throw new Error("Command alias can't be the same as its name");
        const matchingCommand = this.parent?._findCommand(alias);
        if (matchingCommand) {
          const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
          throw new Error(
            `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
          );
        }
        command._aliases.push(alias);
        return this;
      }
      /**
       * Set aliases for the command.
       *
       * Only the first alias is shown in the auto-generated help.
       *
       * @param {string[]} [aliases]
       * @return {(string[]|Command)}
       */
      aliases(aliases) {
        if (aliases === void 0) return this._aliases;
        aliases.forEach((alias) => this.alias(alias));
        return this;
      }
      /**
       * Set / get the command usage `str`.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      usage(str) {
        if (str === void 0) {
          if (this._usage) return this._usage;
          const args = this.registeredArguments.map((arg) => {
            return humanReadableArgName(arg);
          });
          return [].concat(
            this.options.length || this._helpOption !== null ? "[options]" : [],
            this.commands.length ? "[command]" : [],
            this.registeredArguments.length ? args : []
          ).join(" ");
        }
        this._usage = str;
        return this;
      }
      /**
       * Get or set the name of the command.
       *
       * @param {string} [str]
       * @return {(string|Command)}
       */
      name(str) {
        if (str === void 0) return this._name;
        this._name = str;
        return this;
      }
      /**
       * Set the name of the command from script filename, such as process.argv[1],
       * or require.main.filename, or __filename.
       *
       * (Used internally and public although not documented in README.)
       *
       * @example
       * program.nameFromFilename(require.main.filename);
       *
       * @param {string} filename
       * @return {Command}
       */
      nameFromFilename(filename) {
        this._name = path.basename(filename, path.extname(filename));
        return this;
      }
      /**
       * Get or set the directory for searching for executable subcommands of this command.
       *
       * @example
       * program.executableDir(__dirname);
       * // or
       * program.executableDir('subcommands');
       *
       * @param {string} [path]
       * @return {(string|null|Command)}
       */
      executableDir(path2) {
        if (path2 === void 0) return this._executableDir;
        this._executableDir = path2;
        return this;
      }
      /**
       * Return program help documentation.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
       * @return {string}
       */
      helpInformation(contextOptions) {
        const helper = this.createHelp();
        if (helper.helpWidth === void 0) {
          helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
        }
        return helper.formatHelp(this, helper);
      }
      /**
       * @private
       */
      _getHelpContext(contextOptions) {
        contextOptions = contextOptions || {};
        const context = { error: !!contextOptions.error };
        let write;
        if (context.error) {
          write = (arg) => this._outputConfiguration.writeErr(arg);
        } else {
          write = (arg) => this._outputConfiguration.writeOut(arg);
        }
        context.write = contextOptions.write || write;
        context.command = this;
        return context;
      }
      /**
       * Output help information for this command.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      outputHelp(contextOptions) {
        let deprecatedCallback;
        if (typeof contextOptions === "function") {
          deprecatedCallback = contextOptions;
          contextOptions = void 0;
        }
        const context = this._getHelpContext(contextOptions);
        this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
        this.emit("beforeHelp", context);
        let helpInformation = this.helpInformation(context);
        if (deprecatedCallback) {
          helpInformation = deprecatedCallback(helpInformation);
          if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
            throw new Error("outputHelp callback must return a string or a Buffer");
          }
        }
        context.write(helpInformation);
        if (this._getHelpOption()?.long) {
          this.emit(this._getHelpOption().long);
        }
        this.emit("afterHelp", context);
        this._getCommandAndAncestors().forEach(
          (command) => command.emit("afterAllHelp", context)
        );
      }
      /**
       * You can pass in flags and a description to customise the built-in help option.
       * Pass in false to disable the built-in help option.
       *
       * @example
       * program.helpOption('-?, --help' 'show help'); // customise
       * program.helpOption(false); // disable
       *
       * @param {(string | boolean)} flags
       * @param {string} [description]
       * @return {Command} `this` command for chaining
       */
      helpOption(flags, description) {
        if (typeof flags === "boolean") {
          if (flags) {
            this._helpOption = this._helpOption ?? void 0;
          } else {
            this._helpOption = null;
          }
          return this;
        }
        flags = flags ?? "-h, --help";
        description = description ?? "display help for command";
        this._helpOption = this.createOption(flags, description);
        return this;
      }
      /**
       * Lazy create help option.
       * Returns null if has been disabled with .helpOption(false).
       *
       * @returns {(Option | null)} the help option
       * @package
       */
      _getHelpOption() {
        if (this._helpOption === void 0) {
          this.helpOption(void 0, void 0);
        }
        return this._helpOption;
      }
      /**
       * Supply your own option to use for the built-in help option.
       * This is an alternative to using helpOption() to customise the flags and description etc.
       *
       * @param {Option} option
       * @return {Command} `this` command for chaining
       */
      addHelpOption(option) {
        this._helpOption = option;
        return this;
      }
      /**
       * Output help information and exit.
       *
       * Outputs built-in help, and custom text added using `.addHelpText()`.
       *
       * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
       */
      help(contextOptions) {
        this.outputHelp(contextOptions);
        let exitCode = process2.exitCode || 0;
        if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
          exitCode = 1;
        }
        this._exit(exitCode, "commander.help", "(outputHelp)");
      }
      /**
       * Add additional text to be displayed with the built-in help.
       *
       * Position is 'before' or 'after' to affect just this command,
       * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
       *
       * @param {string} position - before or after built-in help
       * @param {(string | Function)} text - string to add, or a function returning a string
       * @return {Command} `this` command for chaining
       */
      addHelpText(position, text2) {
        const allowedValues = ["beforeAll", "before", "after", "afterAll"];
        if (!allowedValues.includes(position)) {
          throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
        }
        const helpEvent = `${position}Help`;
        this.on(helpEvent, (context) => {
          let helpStr;
          if (typeof text2 === "function") {
            helpStr = text2({ error: context.error, command: context.command });
          } else {
            helpStr = text2;
          }
          if (helpStr) {
            context.write(`${helpStr}
`);
          }
        });
        return this;
      }
      /**
       * Output help information if help flags specified
       *
       * @param {Array} args - array of options to search for help flags
       * @private
       */
      _outputHelpIfRequested(args) {
        const helpOption = this._getHelpOption();
        const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
        if (helpRequested) {
          this.outputHelp();
          this._exit(0, "commander.helpDisplayed", "(outputHelp)");
        }
      }
    };
    function incrementNodeInspectorPort(args) {
      return args.map((arg) => {
        if (!arg.startsWith("--inspect")) {
          return arg;
        }
        let debugOption;
        let debugHost = "127.0.0.1";
        let debugPort = "9229";
        let match;
        if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
          debugOption = match[1];
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
          debugOption = match[1];
          if (/^\d+$/.test(match[3])) {
            debugPort = match[3];
          } else {
            debugHost = match[3];
          }
        } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
          debugOption = match[1];
          debugHost = match[3];
          debugPort = match[4];
        }
        if (debugOption && debugPort !== "0") {
          return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
        }
        return arg;
      });
    }
    exports.Command = Command2;
  }
});

// packages/cli/node_modules/commander/index.js
var require_commander = __commonJS({
  "packages/cli/node_modules/commander/index.js"(exports) {
    var { Argument: Argument2 } = require_argument();
    var { Command: Command2 } = require_command();
    var { CommanderError: CommanderError2, InvalidArgumentError: InvalidArgumentError2 } = require_error();
    var { Help: Help2 } = require_help();
    var { Option: Option2 } = require_option();
    exports.program = new Command2();
    exports.createCommand = (name) => new Command2(name);
    exports.createOption = (flags, description) => new Option2(flags, description);
    exports.createArgument = (name, description) => new Argument2(name, description);
    exports.Command = Command2;
    exports.Option = Option2;
    exports.Argument = Argument2;
    exports.Help = Help2;
    exports.CommanderError = CommanderError2;
    exports.InvalidArgumentError = InvalidArgumentError2;
    exports.InvalidOptionArgumentError = InvalidArgumentError2;
  }
});

// packages/cli/node_modules/commander/esm.mjs
var import_index = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  // deprecated old name
  Command,
  Argument,
  Option,
  Help
} = import_index.default;

// packages/cli/src/ui.ts
var E = "\x1B[";
var wrap = (open2, s, close = "39") => `${E}${open2}m${s}${E}${close}m`;
var c = {
  reset: `${E}0m`,
  bold: (s) => `${E}1m${s}${E}22m`,
  dim: (s) => `${E}2m${s}${E}22m`,
  mint: (s) => wrap("38;5;121", s),
  emerald: (s) => wrap("38;5;48", s),
  green: (s) => wrap("38;5;42", s),
  teal: (s) => wrap("38;5;43", s),
  cyan: (s) => wrap("38;5;51", s),
  deep: (s) => wrap("38;5;30", s),
  gray: (s) => wrap("38;5;245", s),
  white: (s) => wrap("38;5;231", s),
  amber: (s) => wrap("38;5;215", s),
  red: (s) => wrap("38;5;203", s)
};
var link = (url, label) => `\x1B]8;;${url}\x07${label}\x1B]8;;\x07`;
var TAGS = {
  INFO: c.cyan,
  OK: c.green,
  CHAIN: c.emerald,
  WARN: c.amber,
  ERR: c.red,
  STEP: c.gray
};
function line(tag, msg, extra) {
  const tail = extra ? " " + Object.entries(extra).map(([k, v]) => c.gray(k + "=") + c.white(String(v))).join(" ") : "";
  console.log(`${c.emerald("\u2B22")} ${c.bold(TAGS[tag](tag.padEnd(5)))} ${msg}${tail}`);
}
var log = {
  info: (m, x) => line("INFO", m, x),
  ok: (m, x) => line("OK", m, x),
  chain: (m, x) => line("CHAIN", m, x),
  warn: (m, x) => line("WARN", m, x),
  err: (m, x) => line("ERR", m, x),
  step: (m, x) => line("STEP", m, x)
};
var ART = [
  [[" \u2588\u2588\u2588\u2588\u2588\u2557 ", "cyan"], [" \u2588\u2588\u2588\u2588\u2588\u2588\u2557", "mint"], ["\u2588\u2588\u2557  \u2588\u2588\u2557", "emerald"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2557 ", "teal"], [" \u2588\u2588\u2588\u2588\u2588\u2557 ", "green"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557", "cyan"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557", "mint"]],
  [["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557", "cyan"], ["\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D", "mint"], ["\u2588\u2588\u2551 \u2588\u2588\u2554\u255D", "emerald"], ["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557", "teal"], ["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557", "green"], ["\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D", "cyan"], ["\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D", "mint"]],
  [["\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551", "cyan"], ["\u2588\u2588\u2551     ", "mint"], ["\u2588\u2588\u2588\u2588\u2588\u2554\u255D ", "emerald"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D", "teal"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551", "green"], ["   \u2588\u2588\u2551   ", "cyan"], ["\u2588\u2588\u2588\u2588\u2588\u2557  ", "mint"]],
  [["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551", "cyan"], ["\u2588\u2588\u2551     ", "mint"], ["\u2588\u2588\u2554\u2550\u2588\u2588\u2557 ", "emerald"], ["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557", "teal"], ["\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551", "green"], ["   \u2588\u2588\u2551   ", "cyan"], ["\u2588\u2588\u2554\u2550\u2550\u255D  ", "mint"]],
  [["\u2588\u2588\u2551  \u2588\u2588\u2551", "cyan"], ["\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557", "mint"], ["\u2588\u2588\u2551  \u2588\u2588\u2557", "emerald"], ["\u2588\u2588\u2551  \u2588\u2588\u2551", "teal"], ["\u2588\u2588\u2551  \u2588\u2588\u2551", "green"], ["   \u2588\u2588\u2551   ", "cyan"], ["\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557", "mint"]],
  [["\u255A\u2550\u255D  \u255A\u2550\u255D", "cyan"], [" \u255A\u2550\u2550\u2550\u2550\u2550\u255D", "mint"], ["\u255A\u2550\u255D  \u255A\u2550\u255D", "emerald"], ["\u255A\u2550\u255D  \u255A\u2550\u255D", "teal"], ["\u255A\u2550\u255D  \u255A\u2550\u255D", "green"], ["   \u255A\u2550\u255D   ", "cyan"], ["\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D", "mint"]]
];
function banner(environment = "stellar testnet") {
  const paint = (col, t) => c[col](t);
  const art = ART.map((row) => "  " + row.map(([t, col]) => paint(col, t)).join("")).join("\n");
  const tag = "  " + c.dim("agent payments") + c.emerald(" \xB7 ") + c.dim("enforced on-chain") + c.emerald(" \xB7 ") + c.dim(environment);
  return art + "\n" + tag;
}

// packages/cli/src/config.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// packages/stellar/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  Client: () => Client,
  DEPLOYMENTS: () => DEPLOYMENTS,
  Errors: () => Errors,
  MAINNET_BUILD_PLATFORM: () => MAINNET_BUILD_PLATFORM,
  MAINNET_MIN_TIMELOCK_DELAY_LEDGERS: () => MAINNET_MIN_TIMELOCK_DELAY_LEDGERS,
  MAINNET_RUST_TOOLCHAIN_VERSION: () => MAINNET_RUST_TOOLCHAIN_VERSION,
  MAINNET_STELLAR_CLI_VERSION: () => MAINNET_STELLAR_CLI_VERSION,
  MAINNET_USDC: () => MAINNET_USDC,
  TESTNET: () => TESTNET,
  contract: () => contract,
  isStellarSigner: () => isStellarSigner,
  keypairSigner: () => keypairSigner,
  mainnetNetworkFromDeploymentManifest: () => mainnetNetworkFromDeploymentManifest,
  networks: () => networks,
  registryClient: () => registryClient,
  rpc: () => rpc,
  stellarSigner: () => stellarSigner,
  token: () => token_exports
});

// packages/stellar/dist/deployments.js
var DEPLOYMENTS = {
  testnet: {
    /** Deployed MandateRegistry contract id. */
    mandateRegistryId: "CCHQ5G4Y4YBMY6D3TYYJSVJVCKUM22Q6TMKCCHVAHY4X7K6QELQACZRM",
    /** Native XLM Stellar Asset Contract — a real SEP-41 token. */
    nativeSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
  }
};

// packages/stellar/dist/client.js
var client_exports = {};
__export(client_exports, {
  Client: () => Client,
  Errors: () => Errors,
  contract: () => contract,
  networks: () => networks,
  rpc: () => rpc
});
import { Buffer as Buffer2 } from "buffer";
__reExport(client_exports, stellar_sdk_star);
import { Client as ContractClient, Spec as ContractSpec } from "@stellar/stellar-sdk/contract";
import * as stellar_sdk_star from "@stellar/stellar-sdk";
import * as contract from "@stellar/stellar-sdk/contract";
import * as rpc from "@stellar/stellar-sdk/rpc";
if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer2;
}
var networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: DEPLOYMENTS.testnet.mandateRegistryId
  }
};
var Errors = {
  1: { message: "AlreadyExists" },
  2: { message: "NotFound" },
  4: { message: "MandateExpired" },
  5: { message: "MandateRevoked" },
  6: { message: "BudgetExceeded" },
  7: { message: "MerchantOutOfScope" },
  8: { message: "BadSequence" },
  9: { message: "InvalidAmount" },
  10: { message: "Paused" },
  11: { message: "UpgradeNotScheduled" },
  12: { message: "UpgradeNotReady" },
  13: { message: "UpgradeAlreadyScheduled" },
  14: { message: "UpgradeRequiresPause" }
};
var Client = class extends ContractClient {
  options;
  static async deploy({ admin }, options) {
    return ContractClient.deploy({ admin }, options);
  }
  constructor(options) {
    super(new ContractSpec([
      "AAAAAAAAAC5FbWVyZ2VuY3kgc3RvcCBmb3IgdGhlIHNvbGUgbW9uZXktbW92aW5nIHBhdGguAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==",
      "AAAAAAAAADZSZXN0b3JlIHRoZSBtb25leS1tb3ZpbmcgcGF0aCBhZnRlciBhbiBlbWVyZ2VuY3kgc3RvcC4AAAAAAAd1bnBhdXNlAAAAAAAAAAAA",
      "AAAAAAAAACJDdXJyZW50IG9wZXJhdGlvbmFsIGFkbWluaXN0cmF0b3IuAAAAAAAJZ2V0X2FkbWluAAAAAAAAAAAAAAEAAAAT",
      "AAAAAAAAADRSZWFkIHRoZSBlbWVyZ2VuY3ktc3RvcCBzdGF0ZSB3aXRob3V0IGF1dGhvcml6YXRpb24uAAAACWlzX3BhdXNlZAAAAAAAAAAAAAABAAAAAQ==",
      "AAAAAAAAAEZSb3RhdGUgb3BlcmF0aW9uYWwgYXV0aG9yaXR5LiBBdXRob3JpemVkIGJ5IHRoZSBjdXJyZW50IGFkbWluaXN0cmF0b3IuAAAAAAAJc2V0X2FkbWluAAAAAAAAAQAAAAAAAAAJbmV3X2FkbWluAAAAAAAAEwAAAAA=",
      "AAAAAAAAAENSZWFkLW9ubHkgYWNjZXNzb3IgZm9yIHRoZSBzdG9yZWQgbWFuZGF0ZSAoaW5zcGVjdGlvbiAvIHByZWZsaWdodCkuAAAAAAtnZXRfbWFuZGF0ZQAAAAABAAAAAAAAAAptYW5kYXRlX2lkAAAAAAPuAAAAIAAAAAEAAAPpAAAH0AAAAAdNYW5kYXRlAAAAAAM=",
      "AAAAAAAAAIRBdG9taWNhbGx5IGVzdGFibGlzaGVzIHRoZSBpbml0aWFsIGFkbWluaXN0cmF0b3IgZHVyaW5nIGRlcGxveW1lbnQuCkNvbnN0cnVjdG9ycyBydW4gb25seSBvbmNlOyBXQVNNIHVwZ3JhZGVzIGRvIG5vdCBydW4gdGhlbSBhZ2Fpbi4AAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
      "AAAAAAAAACdDYW5jZWwgdGhlIGN1cnJlbnRseSBzY2hlZHVsZWQgdXBncmFkZS4AAAAADmNhbmNlbF91cGdyYWRlAAAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
      "AAAAAAAAAEpVc2VyIHdpdGhkcmF3cyBjb25zZW50OyBtYXJrcyB0aGUgbWFuZGF0ZSBSZXZva2VkLiBBdXRob3JpemVkIGJ5IHRoZSB1c2VyLgAAAAAADnJldm9rZV9tYW5kYXRlAAAAAAABAAAAAAAAAAptYW5kYXRlX2lkAAAAAAPuAAAAIAAAAAEAAAPpAAAD7QAAAAAAAAAD",
      "AAAAAAAAAV1UaGUgb25seSBtb25leSBwYXRoLiBBdG9taWM6IHJlcXVpcmVfYXV0aChhZ2VudCkg4oaSIHJlcGxheSBndWFyZAooYGV4cGVjdGVkX3NlcWAgPT0gY3VycmVudCBgc2VxYCwgZWxzZSBgQmFkU2VxdWVuY2VgKSDihpIgcmUtdmFsaWRhdGUg4oaSCmFkdmFuY2Ugc3BlbnQrc2VxIOKGkiBTRVAtNDEgdHJhbnNmZXJfZnJvbSh1c2VyIOKGkiBtZXJjaGFudCkuIFJldmVydHMgb24gYW55CmZhaWx1cmUuIGBleHBlY3RlZF9zZXFgIGlzIHRoZSBtYW5kYXRlJ3MgY3VycmVudCBzZXF1ZW5jZSAocmVhZCBmcm9tCmBnZXRfbWFuZGF0ZWApLCBwcmV2ZW50aW5nIGR1cGxpY2F0ZS9vdXQtb2Ytb3JkZXIgY29uc3VtcHRpb24uAAAAAAAAD2V4ZWN1dGVfcGF5bWVudAAAAAADAAAAAAAAAAptYW5kYXRlX2lkAAAAAAPuAAAAIAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAxleHBlY3RlZF9zZXEAAAAEAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
      "AAAAAAAAAEtFeGVjdXRlIHRoZSBzY2hlZHVsZWQgdXBncmFkZSBhZnRlciB0aGUgZGVsYXkgd2hpbGUgdGhlIGNvbnRyYWN0IGlzIHBhdXNlZC4AAAAAD2V4ZWN1dGVfdXBncmFkZQAAAAAAAAAAAQAAA+kAAAPtAAAAAAAAAAM=",
      "AAAAAAAAAMJTdG9yZSBhIHVzZXItc2lnbmVkIG1hbmRhdGUgZnJvbSBpdHMgYXV0aG9yaXplZCBwYXJhbWV0ZXJzLiBUaGUgY29udHJhY3QKc2V0cyBgc3BlbnQ9MCwgc2VxPTAsIHN0YXR1cz1BY3RpdmVgIGl0c2VsZi4gQXV0aG9yaXplZCBieSBgdXNlcmAuClJldHVybnMgdGhlIG1hbmRhdGUgaWQgKD0gYHZjX2hhc2hgLCB0aGUgc3RvcmFnZSBrZXkpLgAAAAAAEHJlZ2lzdGVyX21hbmRhdGUAAAAHAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAFYWdlbnQAAAAAAAATAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAAAAAAKbWF4X2Ftb3VudAAAAAAACwAAAAAAAAAGZXhwaXJ5AAAAAAAGAAAAAAAAAAd2Y19oYXNoAAAAA+4AAAAgAAAAAQAAA+kAAAPuAAAAIAAAAAM=",
      "AAAAAAAAAERTY2hlZHVsZSBhIHNhbWUtYWRkcmVzcyBXQVNNIHVwZ3JhZGUgYWZ0ZXIgdGhlIGZpeGVkIG9uZS1ob3VyIGRlbGF5LgAAABBzY2hlZHVsZV91cGdyYWRlAAAAAQAAAAAAAAANbmV3X3dhc21faGFzaAAAAAAAA+4AAAAgAAAAAQAAA+kAAAAGAAAAAw==",
      "AAAAAAAAAMtSZWFkLW9ubHkgcHJlZmxpZ2h0IOKAlCB3b3VsZCB0aGlzIHNwZW5kIGJlIHBlcm1pdHRlZCByaWdodCBub3c/IE11dGF0ZXMKbm90aGluZyBhbmQgcmVxdWlyZXMgbm8gYXV0aDsgdGhlIGF1dGhvcml0YXRpdmUgY29uc3VtZSBoYXBwZW5zIG9ubHkgaW4KYGV4ZWN1dGVfcGF5bWVudGAuIChJdCBpcyBhIGRyeS1ydW47IGl0IGNvbnN1bWVzIG5vdGhpbmcuKQAAAAAQdmFsaWRhdGVfbWFuZGF0ZQAAAAMAAAAAAAAACm1hbmRhdGVfaWQAAAAAA+4AAAAgAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACG1lcmNoYW50AAAAEwAAAAEAAAPpAAAD7QAAAAAAAAAD",
      "AAAAAAAAACNGaXhlZCB0aW1lbG9jayBkdXJhdGlvbiBpbiBzZWNvbmRzLgAAAAARZ2V0X3VwZ3JhZGVfZGVsYXkAAAAAAAAAAAAAAQAAAAY=",
      "AAAAAAAAAEVSZWFkIHRoZSBwZW5kaW5nIHVwZ3JhZGUsIGluY2x1ZGluZyBoYXNoIGFuZCBlYXJsaWVzdCBleGVjdXRpb24gdGltZS4AAAAAAAATZ2V0X3BlbmRpbmdfdXBncmFkZQAAAAAAAAAAAQAAA+gAAAfQAAAADlBlbmRpbmdVcGdyYWRlAAA=",
      "AAAAAQAAAAAAAAAAAAAADlBlbmRpbmdVcGdyYWRlAAAAAAACAAAAAAAAAA1leGVjdXRlX2FmdGVyAAAAAAAABgAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACA=",
      "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADQAAAAAAAAANQWxyZWFkeUV4aXN0cwAAAAAAAAEAAAAAAAAACE5vdEZvdW5kAAAAAgAAAAAAAAAOTWFuZGF0ZUV4cGlyZWQAAAAAAAQAAAAAAAAADk1hbmRhdGVSZXZva2VkAAAAAAAFAAAAAAAAAA5CdWRnZXRFeGNlZWRlZAAAAAAABgAAAAAAAAASTWVyY2hhbnRPdXRPZlNjb3BlAAAAAAAHAAAAAAAAAAtCYWRTZXF1ZW5jZQAAAAAIAAAAAAAAAA1JbnZhbGlkQW1vdW50AAAAAAAACQAAAAAAAAAGUGF1c2VkAAAAAAAKAAAAAAAAABNVcGdyYWRlTm90U2NoZWR1bGVkAAAAAAsAAAAAAAAAD1VwZ3JhZGVOb3RSZWFkeQAAAAAMAAAAAAAAABdVcGdyYWRlQWxyZWFkeVNjaGVkdWxlZAAAAAANAAAAAAAAABRVcGdyYWRlUmVxdWlyZXNQYXVzZQAAAA4=",
      "AAAAAgAAAAAAAAAAAAAABlN0YXR1cwAAAAAAAwAAAAAAAAAAAAAABkFjdGl2ZQAAAAAAAAAAAAAAAAAHUmV2b2tlZAAAAAAAAAAAAAAAAAlFeGhhdXN0ZWQAAAA=",
      "AAAAAQAAAAAAAAAAAAAAB01hbmRhdGUAAAAACgAAADdUaGUgT05MWSBwcmluY2lwYWwgcGVybWl0dGVkIHRvIGNhbGwgYGV4ZWN1dGVfcGF5bWVudGAuAAAAAAVhZ2VudAAAAAAAABMAAAArU0VQLTQxIC8gU0FDIGNvbnRyYWN0IGlkIChVU0RDIG9uIHRlc3RuZXQpLgAAAAAFYXNzZXQAAAAAAAATAAAAQUxlZGdlciBjbG9zZSB0aW1lc3RhbXAgKHNlY29uZHMpIGFmdGVyIHdoaWNoIHRoZSBtYW5kYXRlIGlzIGRlYWQuAAAAAAAABmV4cGlyeQAAAAAABgAAACdUb3RhbCBidWRnZXQgYXV0aG9yaXplZCBieSB0aGUgbWFuZGF0ZS4AAAAACm1heF9hbW91bnQAAAAAAAsAAABETVZQOiBzaW5nbGUgYWxsb3dlZCBwYXllZSAoc2NvcGUpLiBUMTogYFZlYzxBZGRyZXNzPmAgb3Igc2NvcGUtaGFzaC4AAAAIbWVyY2hhbnQAAAATAAAAP01vbm90b25pYyBwYXltZW50IGNvdW50ZXIgKG1hbmRhdGUtbGV2ZWwgdHJhY2UgLyByZXBsYXkgZ3VhcmQpLgAAAAADc2VxAAAAAAQAAAA7Q3VtdWxhdGl2ZSBjb25zdW1lZDsgaW52YXJpYW50OiBgMCA8PSBzcGVudCA8PSBtYXhfYW1vdW50YC4AAAAABXNwZW50AAAAAAAACwAAAAAAAAAGc3RhdHVzAAAAAAfQAAAABlN0YXR1cwAAAAAAPVNpZ25lciBvZiB0aGUgQVAyIEludGVudE1hbmRhdGU7IGdyYW50cyB0aGUgU0VQLTQxIGFsbG93YW5jZS4AAAAAAAAEdXNlcgAAABMAAABJSGFzaCBiaW5kaW5nIHRvIHRoZSBvZmYtY2hhaW4gQVAyIEludGVudE1hbmRhdGUgVkM7IGFsc28gdGhlIHN0b3JhZ2Uga2V5LgAAAAAAAAd2Y19oYXNoAAAAA+4AAAAg",
      "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAGUGF1c2VkAAAAAAAAAAAAAAAAAA5QZW5kaW5nVXBncmFkZQAAAAAAAQAAAAAAAAAHTWFuZGF0ZQAAAAABAAAD7gAAACA="
    ]), options);
    this.options = options;
  }
  fromJSON = {
    pause: this.txFromJSON,
    unpause: this.txFromJSON,
    get_admin: this.txFromJSON,
    is_paused: this.txFromJSON,
    set_admin: this.txFromJSON,
    get_mandate: this.txFromJSON,
    cancel_upgrade: this.txFromJSON,
    revoke_mandate: this.txFromJSON,
    execute_payment: this.txFromJSON,
    execute_upgrade: this.txFromJSON,
    register_mandate: this.txFromJSON,
    schedule_upgrade: this.txFromJSON,
    validate_mandate: this.txFromJSON,
    get_upgrade_delay: this.txFromJSON,
    get_pending_upgrade: this.txFromJSON
  };
};

// packages/stellar/dist/index.js
__reExport(dist_exports, client_exports);

// packages/stellar/dist/config.js
var TESTNET = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  mandateRegistryId: DEPLOYMENTS.testnet.mandateRegistryId,
  nativeSac: DEPLOYMENTS.testnet.nativeSac
};

// packages/stellar/dist/signer.js
import { Buffer as Buffer3 } from "buffer";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
function isStellarSigner(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const candidate = value;
  return typeof candidate.publicKey === "string" && StrKey.isValidEd25519PublicKey(candidate.publicKey) && typeof candidate.signTransaction === "function" && (candidate.signAuthEntry === void 0 || typeof candidate.signAuthEntry === "function");
}
function keypairSigner(secretOrKeypair, networkPassphrase) {
  const keypair = typeof secretOrKeypair === "string" ? Keypair.fromSecret(secretOrKeypair) : secretOrKeypair;
  const node = basicNodeSigner(keypair, networkPassphrase);
  return {
    publicKey: keypair.publicKey(),
    keypair,
    signTransaction: node.signTransaction,
    signAuthEntry: node.signAuthEntry,
    signPayload: async (payload) => keypair.sign(Buffer3.from(payload))
  };
}
function stellarSigner(input, networkPassphrase) {
  if (isStellarSigner(input))
    return input;
  return keypairSigner(input, networkPassphrase);
}

// packages/stellar/dist/registry.js
function registryClient(net, signer) {
  return new Client({
    contractId: net.mandateRegistryId,
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    publicKey: signer.publicKey,
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
    allowHttp: net.rpcUrl.startsWith("http://")
  });
}

// packages/stellar/dist/release-manifest.js
import { Address, Asset, Networks, StrKey as StrKey2 } from "@stellar/stellar-sdk";
var MAINNET_USDC = Object.freeze({
  code: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  contractId: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
});
var MAINNET_MIN_TIMELOCK_DELAY_LEDGERS = 17280;
var MAINNET_BUILD_PLATFORM = "ubuntu-24.04-x86_64";
var MAINNET_RUST_TOOLCHAIN_VERSION = "1.96.0";
var MAINNET_STELLAR_CLI_VERSION = "26.1.0";
function objectAt(parent, key) {
  const value = parent[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`release manifest ${key} must be an object`);
  }
  return value;
}
function textAt(parent, key) {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`release manifest ${key} must be a non-empty string`);
  }
  return value;
}
function integerAt(parent, key) {
  const value = parent[key];
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`release manifest ${key} must be a positive integer`);
  }
  return value;
}
function arrayAt(parent, key) {
  const value = parent[key];
  if (!Array.isArray(value))
    throw new Error(`release manifest ${key} must be an array`);
  return value;
}
function trueAt(parent, key) {
  if (parent[key] !== true)
    throw new Error(`release manifest verification.${key} must be true`);
}
function sha256At(parent, key) {
  const value = textAt(parent, key).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`release manifest ${key} must be a lowercase SHA-256`);
  }
  return value;
}
function transactionHashAt(parent, key) {
  const value = textAt(parent, key).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`release manifest ${key} must be a Stellar transaction hash`);
  }
  return value;
}
function addressAt(parent, key, contractOnly = false) {
  const value = textAt(parent, key);
  try {
    Address.fromString(value);
  } catch {
    throw new Error(`release manifest ${key} must be a Stellar address`);
  }
  if (contractOnly && !StrKey2.isValidContract(value)) {
    throw new Error(`release manifest ${key} must be a Stellar contract address`);
  }
  return value;
}
function accountAt(parent, key) {
  const value = addressAt(parent, key);
  if (!StrKey2.isValidEd25519PublicKey(value)) {
    throw new Error(`release manifest ${key} must be a Stellar G-account`);
  }
  return value;
}
function exactDateAt(parent, key) {
  const value = textAt(parent, key);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`release manifest ${key} must be a canonical ISO timestamp`);
  }
  return value;
}
function mainnetNetworkFromDeploymentManifest(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("release manifest must be an object");
  }
  const manifest = input;
  if (manifest.schema_version !== 1)
    throw new Error("unsupported release manifest schema_version");
  const network = objectAt(manifest, "network");
  if (textAt(network, "name") !== "mainnet")
    throw new Error("release manifest network must be mainnet");
  if (textAt(network, "passphrase") !== Networks.PUBLIC) {
    throw new Error("release manifest has the wrong mainnet passphrase");
  }
  const rpcUrl = textAt(network, "rpc_url");
  const parsedRpc = new URL(rpcUrl);
  if (parsedRpc.protocol !== "https:" || parsedRpc.username || parsedRpc.password) {
    throw new Error("release manifest rpc_url must be credential-free HTTPS");
  }
  const source = objectAt(manifest, "source");
  if (textAt(source, "repository") !== "https://github.com/ackrate/ackrate-protocol-contracts") {
    throw new Error("release manifest source repository is not the canonical contracts repository");
  }
  const sourceCommit = textAt(source, "commit").toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit))
    throw new Error("release manifest source commit is invalid");
  if (textAt(source, "branch") !== "main")
    throw new Error("release manifest source branch must be main");
  if (textAt(source, "build_platform") !== MAINNET_BUILD_PLATFORM) {
    throw new Error(`release manifest build platform must be ${MAINNET_BUILD_PLATFORM}`);
  }
  if (textAt(source, "rust_toolchain_version") !== MAINNET_RUST_TOOLCHAIN_VERSION) {
    throw new Error(`release manifest Rust toolchain version must be ${MAINNET_RUST_TOOLCHAIN_VERSION}`);
  }
  if (textAt(source, "stellar_cli_version") !== MAINNET_STELLAR_CLI_VERSION) {
    throw new Error(`release manifest Stellar CLI version must be ${MAINNET_STELLAR_CLI_VERSION}`);
  }
  if (source.dirty !== false)
    throw new Error("release manifest source must be clean");
  const artifacts = objectAt(manifest, "artifacts");
  const timelockArtifact = objectAt(artifacts, "timelock_controller");
  const registryArtifact = objectAt(artifacts, "mandate_registry");
  const timelockWasmSha256 = sha256At(timelockArtifact, "sha256");
  const registryWasmSha256 = sha256At(registryArtifact, "sha256");
  integerAt(timelockArtifact, "size_bytes");
  integerAt(registryArtifact, "size_bytes");
  const publicConfiguration = objectAt(manifest, "public_configuration");
  if (textAt(publicConfiguration, "usdc_asset_code") !== MAINNET_USDC.code) {
    throw new Error("release manifest asset code must be USDC");
  }
  if (textAt(publicConfiguration, "usdc_issuer") !== MAINNET_USDC.issuer) {
    throw new Error("release manifest USDC issuer is not Circle's published Stellar mainnet issuer");
  }
  const authorityAccount = accountAt(publicConfiguration, "authority_2_of_3_account");
  const emergencyPauser = accountAt(publicConfiguration, "emergency_pauser");
  accountAt(publicConfiguration, "deployment_source_account");
  if (authorityAccount === emergencyPauser) {
    throw new Error("release manifest emergency pauser must be separate from the 2-of-3 authority");
  }
  const usdcContractId = addressAt(publicConfiguration, "usdc_sac", true);
  if (usdcContractId !== MAINNET_USDC.contractId) {
    throw new Error("release manifest USDC SAC is not the canonical Stellar mainnet asset contract");
  }
  textAt(publicConfiguration, "usdc_derivation_evidence");
  textAt(publicConfiguration, "usdc_independent_verifier");
  const timelockDelay = integerAt(publicConfiguration, "timelock_min_delay_ledgers");
  if (timelockDelay < MAINNET_MIN_TIMELOCK_DELAY_LEDGERS || timelockDelay > 4294967295) {
    throw new Error("release manifest timelock delay must be at least 17280 ledgers and fit u32");
  }
  const deployment = objectAt(manifest, "deployment");
  textAt(deployment, "authorized_by");
  const authorizedAt = exactDateAt(deployment, "authorized_at");
  const deployedAt = exactDateAt(deployment, "deployed_at");
  if (Date.parse(deployedAt) < Date.parse(authorizedAt)) {
    throw new Error("release manifest deployment predates authorization");
  }
  const deploymentLedger = integerAt(deployment, "ledger");
  transactionHashAt(deployment, "timelock_transaction_hash");
  transactionHashAt(deployment, "registry_transaction_hash");
  const timelockContractId = addressAt(deployment, "timelock_contract_id", true);
  const mandateRegistryId = addressAt(deployment, "registry_contract_id", true);
  if (sha256At(deployment, "timelock_observed_wasm_hash") !== timelockWasmSha256) {
    throw new Error("release manifest timelock artifact and observed WASM hashes differ");
  }
  if (sha256At(deployment, "registry_observed_wasm_hash") !== registryWasmSha256) {
    throw new Error("release manifest registry artifact and observed WASM hashes differ");
  }
  if ((/* @__PURE__ */ new Set([timelockContractId, mandateRegistryId, usdcContractId])).size !== 3) {
    throw new Error("release manifest contract identities must be distinct");
  }
  const constructorArguments = objectAt(manifest, "constructor_arguments");
  const timelockArguments = objectAt(constructorArguments, "timelock");
  const proposers = arrayAt(timelockArguments, "proposers");
  if (proposers.length !== 1 || proposers[0] !== authorityAccount) {
    throw new Error("release manifest timelock proposer must be the 2-of-3 authority");
  }
  if (arrayAt(timelockArguments, "executors").length !== 0) {
    throw new Error("release manifest timelock executors must be empty for permissionless execution");
  }
  if (timelockArguments.admin !== null) {
    throw new Error("release manifest timelock admin must be null for self-administration");
  }
  const registryArguments = objectAt(constructorArguments, "mandate_registry");
  for (const key of ["admin", "asset_policy", "upgrader"]) {
    if (addressAt(registryArguments, key, true) !== timelockContractId) {
      throw new Error(`release manifest registry ${key} must be the timelock`);
    }
  }
  if (accountAt(registryArguments, "unpauser") !== authorityAccount) {
    throw new Error("release manifest registry unpauser must be the 2-of-3 authority");
  }
  if (accountAt(registryArguments, "pauser") !== emergencyPauser) {
    throw new Error("release manifest registry pauser must be the emergency key");
  }
  if (addressAt(registryArguments, "initial_asset", true) !== usdcContractId) {
    throw new Error("release manifest registry initial asset must be the canonical USDC SAC");
  }
  const verification = objectAt(manifest, "verification");
  for (const key of [
    "artifact_hashes_match",
    "constructor_arguments_match",
    "timelock_self_administered",
    "authority_is_proposer_and_canceller",
    "executor_is_permissionless_after_delay",
    "registry_admin_is_timelock",
    "registry_asset_policy_is_timelock",
    "registry_upgrader_is_timelock",
    "registry_unpauser_is_2_of_3",
    "registry_pauser_is_emergency_key",
    "registry_initially_unpaused",
    "registry_usdc_asset_allowed"
  ])
    trueAt(verification, key);
  textAt(verification, "independent_read_only_verifier");
  const verifiedAt = exactDateAt(verification, "verified_at");
  if (Date.parse(verifiedAt) < Date.parse(deployedAt)) {
    throw new Error("release manifest verification predates deployment");
  }
  return Object.freeze({
    rpcUrl,
    networkPassphrase: Networks.PUBLIC,
    mandateRegistryId,
    nativeSac: Asset.native().contractId(Networks.PUBLIC),
    settlementAsset: Object.freeze({
      code: MAINNET_USDC.code,
      issuer: MAINNET_USDC.issuer,
      contractId: usdcContractId,
      decimals: 7
    }),
    release: Object.freeze({
      sourceCommit,
      deploymentLedger,
      registryWasmSha256,
      timelockContractId,
      timelockWasmSha256
    })
  });
}

// packages/stellar/dist/token.js
var token_exports = {};
__export(token_exports, {
  approve: () => approve,
  balance: () => balance,
  decimals: () => decimals
});
import { Address as Address2, Contract, TransactionBuilder, nativeToScVal, scValToNative, rpc as rpc2 } from "@stellar/stellar-sdk";
var INCLUSION_FEE = "100000";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(server, hash3) {
  let res = await server.getTransaction(hash3);
  for (let i = 0; res.status === "NOT_FOUND" && i < 30; i += 1) {
    await sleep(1e3);
    res = await server.getTransaction(hash3);
  }
  if (res.status !== "SUCCESS") {
    throw new Error(`transaction ${hash3} did not succeed: ${res.status}`);
  }
}
async function approve(net, tokenId, owner, spender, amount, expirationLedger) {
  const signer = stellarSigner(owner, net.networkPassphrase);
  const server = new rpc2.Server(net.rpcUrl, { allowHttp: net.rpcUrl.startsWith("http://") });
  const source = await server.getAccount(signer.publicKey);
  const exp = expirationLedger ?? (await server.getLatestLedger()).sequence + 17280;
  const op = new Contract(tokenId).call("approve", new Address2(signer.publicKey).toScVal(), new Address2(spender).toScVal(), nativeToScVal(amount, { type: "i128" }), nativeToScVal(exp, { type: "u32" }));
  const built = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: net.networkPassphrase
  }).addOperation(op).setTimeout(60).build();
  const prepared = await server.prepareTransaction(built);
  const signed = await signer.signTransaction(prepared.toXDR(), {
    address: signer.publicKey,
    networkPassphrase: net.networkPassphrase
  });
  if (signed.error)
    throw new Error(`approve signing failed: ${signed.error.message}`);
  if (signed.signerAddress && signed.signerAddress !== signer.publicKey) {
    throw new Error("approve signing failed: wallet returned a different signer address");
  }
  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, net.networkPassphrase);
  const sent = await server.sendTransaction(signedTransaction);
  if (sent.errorResult)
    throw new Error(`approve submit failed: ${sent.status}`);
  await settle(server, sent.hash);
  return sent.hash;
}
async function balance(net, tokenId, who) {
  const server = new rpc2.Server(net.rpcUrl, { allowHttp: net.rpcUrl.startsWith("http://") });
  const source = await server.getAccount(who).catch(() => null);
  const acct = source ?? await server.getAccount(who);
  const op = new Contract(tokenId).call("balance", new Address2(who).toScVal());
  const tx = new TransactionBuilder(acct, {
    fee: INCLUSION_FEE,
    networkPassphrase: net.networkPassphrase
  }).addOperation(op).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc2.Api.isSimulationError(sim))
    throw new Error(`balance sim failed: ${sim.error}`);
  return scValToNative(sim.result.retval);
}
async function decimals(net, tokenId, sourceAccount) {
  const server = new rpc2.Server(net.rpcUrl, { allowHttp: net.rpcUrl.startsWith("http://") });
  const source = await server.getAccount(sourceAccount);
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: net.networkPassphrase
  }).addOperation(new Contract(tokenId).call("decimals")).setTimeout(60).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc2.Api.isSimulationError(sim))
    throw new Error(`decimals sim failed: ${sim.error}`);
  const value = scValToNative(sim.result.retval);
  if (!Number.isInteger(value) || value < 0 || value > 18) {
    throw new Error("token decimals response is invalid");
  }
  return value;
}

// packages/cli/src/config.ts
var CONFIG_FILE = "ackrate.config.json";
function defaultConfig() {
  return {
    network: "testnet",
    contractId: TESTNET.mandateRegistryId,
    explorer: "https://stellar.expert/explorer/testnet",
    unlockPrice: "1.00",
    budget: "3.00"
  };
}
function networkConfig(config) {
  return { ...TESTNET, mandateRegistryId: config.contractId };
}
function configPath(cwd = process.cwd()) {
  return resolve(cwd, CONFIG_FILE);
}
function configExists(cwd) {
  return existsSync(configPath(cwd));
}
function loadConfig(cwd) {
  return JSON.parse(readFileSync(configPath(cwd), "utf8"));
}
function saveConfig(config, cwd) {
  const path = configPath(cwd);
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  return path;
}

// packages/cli/src/commands/init.ts
function runInit(opts = {}) {
  console.log("\n" + banner() + "\n");
  if (configExists() && !opts.force) {
    log.warn(`${CONFIG_FILE} already exists`, { path: configPath() });
    log.info("re-run with --force to overwrite, or edit it directly");
    return;
  }
  const config = defaultConfig();
  const path = saveConfig(config);
  log.ok(`wrote ${CONFIG_FILE}`, { path });
  log.info("config", { network: config.network, contract: config.contractId });
  console.log(
    "\n" + c.bold("Next steps") + "\n" + c.gray("  1. ") + c.white("ackrate setup") + c.gray("   configure keys + fund testnet accounts") + "\n" + c.gray("  2. ") + c.white("ackrate mandate create") + c.gray("   register an AP2 mandate on-chain") + "\n" + c.gray("  3. ") + c.white("ackrate pay") + c.gray("   make an agent-signed payment") + "\n"
  );
}

// packages/cli/src/commands/setup.ts
import { Keypair as Keypair2, rpc as rpc3 } from "@stellar/stellar-sdk";

// packages/cli/src/secrets.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, existsSync as existsSync2, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function ackrateHome() {
  return process.env.ACKRATE_HOME ?? join(homedir(), ".ackrate");
}
function credentialsPath() {
  return join(ackrateHome(), "credentials.json");
}
function credentialsExist() {
  return existsSync2(credentialsPath());
}
function loadCredentials() {
  return JSON.parse(readFileSync2(credentialsPath(), "utf8"));
}
function saveCredentials(creds) {
  const home = ackrateHome();
  mkdirSync(home, { recursive: true, mode: 448 });
  const path = credentialsPath();
  writeFileSync2(path, JSON.stringify(creds, null, 2) + "\n", { mode: 384 });
  return path;
}

// packages/cli/src/commands/setup.ts
var short = (s) => s ? `${s.slice(0, 6)}\u2026${s.slice(-4)}` : "";
var sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
async function fund(pub, server) {
  for (let round = 0; round < 4; round += 1) {
    await fetch(`https://friendbot.stellar.org/?addr=${pub}`).catch(() => void 0);
    for (let i = 0; i < 8; i += 1) {
      try {
        await server.getAccount(pub);
        return;
      } catch {
        await sleep2(1e3);
      }
    }
  }
  throw new Error(`friendbot could not fund ${short(pub)} after several attempts`);
}
async function runSetup(opts = {}) {
  if (!configExists()) {
    log.warn("no ackrate.config.json here \u2014 run `ackrate init` first");
    return;
  }
  if (credentialsExist() && !opts.force) {
    log.warn("credentials already exist", { path: credentialsPath() });
    log.info("re-run with --force to regenerate fresh testnet keys");
    return;
  }
  const config = configExists() ? loadConfig() : defaultConfig();
  const net = networkConfig(config);
  const server = new rpc3.Server(net.rpcUrl);
  const accountUrl = (pub) => `${config.explorer}/account/${pub}`;
  const user = Keypair2.random();
  const agent = Keypair2.random();
  const merchant = Keypair2.random();
  log.step("generated 3 fresh testnet keypairs", {
    user: short(user.publicKey()),
    agent: short(agent.publicKey()),
    merchant: short(merchant.publicKey())
  });
  log.step("funding via friendbot");
  await Promise.all([fund(user.publicKey(), server), fund(agent.publicKey(), server), fund(merchant.publicKey(), server)]);
  log.chain("accounts funded + visible on Soroban RPC");
  const creds = {
    network: config.network,
    userSecret: user.secret(),
    userPublic: user.publicKey(),
    agentSecret: agent.secret(),
    agentPublic: agent.publicKey(),
    merchantSecret: merchant.secret(),
    merchantPublic: merchant.publicKey()
  };
  const path = saveCredentials(creds);
  log.ok("wrote credentials (0600, outside the repo)", { path });
  console.log(
    "\n" + c.bold("Accounts") + "\n" + c.gray("  user     ") + c.white(user.publicKey()) + c.dim("  " + accountUrl(user.publicKey())) + "\n" + c.gray("  agent    ") + c.white(agent.publicKey()) + c.dim("  " + accountUrl(agent.publicKey())) + "\n" + c.gray("  merchant ") + c.white(merchant.publicKey()) + c.dim("  " + accountUrl(merchant.publicKey())) + "\n"
  );
  log.info("next", { run: "ackrate mandate create" });
}

// packages/sdk/dist/index.js
import { Buffer as Buffer5 } from "buffer";
import { hash as hash2, rpc as rpc4 } from "@stellar/stellar-sdk";

// packages/sdk/dist/x402.js
import { Buffer as Buffer4 } from "buffer";
import { Keypair as Keypair3, hash } from "@stellar/stellar-sdk";
var X_PAYMENT_HEADER = "x-payment";
var ACKRATE_PAYMENT_CAPABILITIES_HEADER = "ackrate-payment-capabilities";
var BOUND_PAYMENT_CAPABILITY = "ackrate-bound-v2";
var BOUND_PAYMENT_SCHEME = "ackrate-soroban-bound";
var CHALLENGE_DOMAIN = Buffer4.from("ACKRATE\0X402\0CHALLENGE\0V2\0", "utf8");
var PROOF_DOMAIN = Buffer4.from("ACKRATE\0X402\0BOUND-PROOF\0V2\0", "utf8");
var HEX_32 = /^[0-9a-f]{64}$/;
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`x402: ${label} contains missing or unknown fields`);
  }
}
function object(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`x402: ${label} must be a JSON object`);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`x402: ${label} must be a non-empty exact string`);
  }
  return value;
}
function canonicalPaymentOrigin(value, label = "challenge audience") {
  const origin = text(value, label);
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`x402: ${label} must be an absolute HTTP(S) origin`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" || parsed.origin !== origin || parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    throw new Error(`x402: ${label} must be an exact HTTP(S) origin without path, query, credentials, or fragment`);
  }
  return origin;
}
function safeInteger(value, label) {
  if (!Number.isSafeInteger(value))
    throw new Error(`x402: ${label} must be a safe integer`);
  return value;
}
function canonicalBase64(value, decodedLength, label) {
  const encoded = text(value, label);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`x402: ${label} must be canonical base64`);
  }
  const decoded = Buffer4.from(encoded, "base64");
  if (decoded.length !== decodedLength || decoded.toString("base64") !== encoded) {
    throw new Error(`x402: ${label} has the wrong decoded length or encoding`);
  }
  return encoded;
}
function canonicalBase64Url32(value, label) {
  const encoded = text(value, label);
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error(`x402: ${label} must be canonical unpadded base64url`);
  }
  const decoded = Buffer4.from(encoded, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== encoded) {
    throw new Error(`x402: ${label} must encode exactly 32 bytes`);
  }
  return encoded;
}
function parseBoundPaymentChallenge(value) {
  const challenge = object(value, "bound challenge");
  exactKeys(challenge, [
    "proofVersion",
    "challengeId",
    "audience",
    "scheme",
    "method",
    "resource",
    "bodySha256",
    "network",
    "networkId",
    "registryId",
    "merchant",
    "asset",
    "amountStroops",
    "decimals",
    "issuedAt",
    "expiresAt",
    "authorization"
  ], "bound challenge");
  if (challenge.proofVersion !== 2)
    throw new Error("x402: unsupported bound challenge version");
  const challengeId = canonicalBase64Url32(challenge.challengeId, "challengeId");
  const method = text(challenge.method, "challenge method");
  if (method !== method.toUpperCase())
    throw new Error("x402: challenge method must be uppercase");
  const bodySha256 = challenge.bodySha256 === null ? null : text(challenge.bodySha256, "challenge bodySha256");
  if (bodySha256 !== null && !HEX_32.test(bodySha256)) {
    throw new Error("x402: bodySha256 must be null or 32-byte lowercase hex");
  }
  const networkId = text(challenge.networkId, "networkId");
  if (!HEX_32.test(networkId))
    throw new Error("x402: networkId must be 32-byte lowercase hex");
  const amountStroops = text(challenge.amountStroops, "amountStroops");
  if (!/^[1-9]\d*$/.test(amountStroops))
    throw new Error("x402: amountStroops must be a positive canonical integer");
  const decimals2 = safeInteger(challenge.decimals, "challenge decimals");
  if (decimals2 < 0 || decimals2 > 38)
    throw new Error("x402: challenge decimals are out of range");
  const issuedAt = safeInteger(challenge.issuedAt, "challenge issuedAt");
  const expiresAt = safeInteger(challenge.expiresAt, "challenge expiresAt");
  if (issuedAt <= 0 || expiresAt <= issuedAt)
    throw new Error("x402: challenge time window is invalid");
  const authorization = object(challenge.authorization, "challenge authorization");
  exactKeys(authorization, ["algorithm", "mac"], "challenge authorization");
  if (authorization.algorithm !== "hmac-sha256")
    throw new Error("x402: unsupported challenge authorization");
  return {
    proofVersion: 2,
    challengeId,
    audience: canonicalPaymentOrigin(challenge.audience),
    scheme: text(challenge.scheme, "challenge scheme"),
    method,
    resource: text(challenge.resource, "challenge resource"),
    bodySha256,
    network: text(challenge.network, "challenge network"),
    networkId,
    registryId: text(challenge.registryId, "challenge registryId"),
    merchant: text(challenge.merchant, "challenge merchant"),
    asset: text(challenge.asset, "challenge asset"),
    amountStroops,
    decimals: decimals2,
    issuedAt,
    expiresAt,
    authorization: {
      algorithm: "hmac-sha256",
      mac: canonicalBase64(authorization.mac, 32, "challenge mac")
    }
  };
}
function boundChallengeAuthorizationBytes(challenge) {
  const canonical = JSON.stringify({
    proofVersion: challenge.proofVersion,
    challengeId: challenge.challengeId,
    audience: challenge.audience,
    scheme: challenge.scheme,
    method: challenge.method,
    resource: challenge.resource,
    bodySha256: challenge.bodySha256,
    network: challenge.network,
    networkId: challenge.networkId,
    registryId: challenge.registryId,
    merchant: challenge.merchant,
    asset: challenge.asset,
    amountStroops: challenge.amountStroops,
    decimals: challenge.decimals,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt
  });
  return Buffer4.concat([CHALLENGE_DOMAIN, Buffer4.from(canonical, "utf8")]);
}
function hashBoundPaymentChallenge(challenge) {
  return hash(boundChallengeAuthorizationBytes(challenge)).toString("hex");
}
function boundProofDigest(input) {
  const txHash = input.txHash.toLowerCase();
  const mandateId = input.mandateId.toLowerCase();
  if (!HEX_32.test(txHash))
    throw new Error("x402: transaction hash must be 32-byte lowercase hex");
  if (!HEX_32.test(mandateId))
    throw new Error("x402: mandate id must be 32-byte lowercase hex");
  const challengeHash = hashBoundPaymentChallenge(input.challenge);
  const canonical = JSON.stringify({
    proofVersion: 2,
    scheme: input.challenge.scheme,
    network: input.challenge.network,
    networkId: input.challenge.networkId,
    registryId: input.challenge.registryId,
    challengeId: input.challenge.challengeId,
    challengeHash,
    txHash,
    mandateId
  });
  return hash(Buffer4.concat([PROOF_DOMAIN, Buffer4.from(canonical, "utf8")]));
}
async function createBoundPaymentProofWithSigner(input) {
  const challenge = parseBoundPaymentChallenge(input.challenge);
  Object.freeze(challenge.authorization);
  Object.freeze(challenge);
  const txHash = input.txHash.toLowerCase();
  const mandateId = input.mandateId.toLowerCase();
  const digest = boundProofDigest({ challenge, txHash, mandateId });
  const signed = Buffer4.from(await input.signer.signPayload(digest));
  if (signed.length !== 64 || !Keypair3.fromPublicKey(input.signer.publicKey).verify(digest, signed)) {
    throw new Error("x402: external signer returned an invalid bound-proof signature");
  }
  const authorization = Object.freeze({
    algorithm: "stellar-ed25519-sha256",
    signature: signed.toString("base64")
  });
  return Object.freeze({
    proofVersion: 2,
    scheme: challenge.scheme,
    network: challenge.network,
    txHash,
    mandateId,
    challenge,
    authorization
  });
}
async function parse402(response) {
  let body;
  try {
    body = await response.clone().json();
  } catch {
    throw new Error("x402: the 402 response body was not valid JSON");
  }
  const accepts = body?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("x402: the 402 response carried no `accepts` payment requirement");
  }
  const accepted = object(accepts[0], "payment requirement");
  const amount = String(accepted.maxAmountRequired ?? accepted.amount ?? "");
  const payTo = String(accepted.payTo ?? "");
  if (!amount)
    throw new Error("x402: the payment requirement is missing an amount");
  if (!payTo)
    throw new Error("x402: the payment requirement is missing `payTo` (the merchant)");
  const extra = object(accepted.extra ?? {}, "payment requirement extra");
  if ("ackrateProofVersion" in extra && extra.ackrateProofVersion !== 2) {
    throw new Error("x402: unsupported Ackrate payment proof version");
  }
  const proofVersion = extra.ackrateProofVersion === 2 ? 2 : 1;
  const challenge = proofVersion === 2 ? parseBoundPaymentChallenge(extra.challenge) : void 0;
  return {
    scheme: String(accepted.scheme ?? "ackrate-soroban"),
    network: String(accepted.network ?? "stellar-testnet"),
    amount,
    asset: String(accepted.asset ?? ""),
    payTo,
    resource: String(accepted.resource ?? ""),
    contract: extra.contract ? String(extra.contract) : void 0,
    ...proofVersion === 2 ? { proofVersion: 2, challenge } : {}
  };
}
function encodePaymentProof(proof) {
  return Buffer4.from(JSON.stringify(proof), "utf8").toString("base64");
}
function isBoundPaymentProof(proof) {
  return "proofVersion" in proof && proof.proofVersion === 2;
}

// packages/sdk/dist/payment-sequence.js
var U32_MAX = 2n ** 32n - 1n;
function normalizeExpectedPaymentSequence(value) {
  let normalized;
  if (typeof value === "bigint") {
    normalized = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("expected payment sequence must be a safe non-negative integer");
    }
    normalized = BigInt(value);
  } else {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) {
      throw new Error("expected payment sequence must be canonical unsigned decimal");
    }
    normalized = BigInt(value);
  }
  if (normalized < 0n || normalized > U32_MAX) {
    throw new Error("expected payment sequence is outside the contract u32 range");
  }
  return Number(normalized);
}
function resolveExpectedPaymentSequence(currentSequence, requestedSequence) {
  const current = normalizeExpectedPaymentSequence(currentSequence);
  const expected = requestedSequence === void 0 ? current : normalizeExpectedPaymentSequence(requestedSequence);
  if (current !== expected) {
    throw new Error(`payment operation expected mandate sequence ${expected}, but current sequence is ${current}; refusing to create another transaction`);
  }
  return expected;
}

// packages/sdk/dist/index.js
function createSettlementReceiptId(receipt) {
  return hash2(Buffer5.from(JSON.stringify([
    "ackrate-settlement-receipt-v2",
    receipt.proofVersion,
    receipt.url,
    receipt.method,
    receipt.txHash,
    receipt.mandateId,
    receipt.amount,
    receipt.submittedAt,
    receipt.validUntil,
    encodePaymentProof(receipt.proof)
  ]), "utf8")).toString("hex");
}
var deliveredReceipts = /* @__PURE__ */ new WeakMap();
var DeliveryPendingError = class extends Error {
  receipt;
  constructor(receipt, cause) {
    super(`payment transaction ${receipt.txHash} was prepared and broadcast may have been attempted, but settlement or delivery is pending; reconcile and retry the same receipt and do not pay again`, { cause });
    this.name = "DeliveryPendingError";
    this.receipt = receipt;
  }
};
var SettlementUncertainError = class extends Error {
  settlement;
  constructor(settlement2, cause) {
    super(`payment transaction ${settlement2.txHash} was prepared and broadcast was attempted, but its final result is uncertain; reconcile this hash before any new payment`, { cause });
    this.name = "SettlementUncertainError";
    this.settlement = settlement2;
  }
};
var PaymentRejectedError = class extends Error {
  mandateId;
  constructor(mandateId, cause) {
    super(`payment rejected by contract for mandate ${mandateId}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "PaymentRejectedError";
    this.mandateId = mandateId;
  }
};
var DEFAULT_DECIMALS = 7;
var PAYMENT_TIMEOUT_SECONDS = 60;
var I128_MAX = 2n ** 127n - 1n;
var MAX_EXPIRY = Number.MAX_SAFE_INTEGER;
var activeMandatePaymentClaims = /* @__PURE__ */ new Map();
var FINALIZED_CONTRACT_ERROR_CODES = /* @__PURE__ */ new Set([
  1,
  2,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  25,
  26,
  27,
  28,
  29,
  30,
  31
]);
function toStroops(human, decimals2 = DEFAULT_DECIMALS) {
  const s = String(human).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid amount ${JSON.stringify(human)}: expected a non-negative decimal like "5.00".`);
  }
  const dot = s.indexOf(".");
  const whole = dot === -1 ? s : s.slice(0, dot);
  const frac = dot === -1 ? "" : s.slice(dot + 1);
  if (frac.length > decimals2) {
    throw new Error(`Amount ${JSON.stringify(human)} has more than ${decimals2} decimal places.`);
  }
  const fracPadded = (frac + "0".repeat(decimals2)).slice(0, decimals2);
  const stroops = BigInt(whole) * 10n ** BigInt(decimals2) + BigInt(fracPadded || "0");
  if (stroops > I128_MAX) {
    throw new Error(`Amount ${JSON.stringify(human)} is too large to fit the contract's i128 amount field.`);
  }
  return stroops;
}
var mandateUserSigner = (mandate2, input, net) => {
  const signer = stellarSigner(input, net.networkPassphrase);
  if (signer.publicKey !== mandate2.user) {
    throw new Error("the transaction signer must match the mandate user");
  }
  return signer;
};
var Agent = class {
  net;
  mandate;
  agentSigner;
  proofPolicy;
  receiptStore;
  pendingSettlement;
  paymentClaimOwner = /* @__PURE__ */ Symbol("ackrate-payment-claim");
  paymentClaimKey;
  constructor(net, mandate2, agentSigner, proofPolicy = "legacy-compatible", receiptStore) {
    this.net = net;
    this.mandate = mandate2;
    this.agentSigner = agentSigner;
    this.proofPolicy = proofPolicy;
    this.receiptStore = receiptStore;
  }
  claimPaymentOperation() {
    if (this.paymentClaimKey)
      throw new Error("another payment operation is already active on this agent");
    const key = `${this.net.networkPassphrase}
${this.net.mandateRegistryId}
${this.mandate.id}`;
    if (activeMandatePaymentClaims.has(key)) {
      throw new Error("another payment operation for this mandate is already active");
    }
    activeMandatePaymentClaims.set(key, this.paymentClaimOwner);
    this.paymentClaimKey = key;
  }
  releasePaymentOperation() {
    const key = this.paymentClaimKey;
    if (!key)
      return;
    if (activeMandatePaymentClaims.get(key) === this.paymentClaimOwner) {
      activeMandatePaymentClaims.delete(key);
    }
    this.paymentClaimKey = void 0;
  }
  async hydratePendingReceipt() {
    if (this.pendingSettlement || !this.receiptStore)
      return void 0;
    const receipts = await this.receiptStore.listPending();
    const receipt = [...receipts].filter((candidate) => candidate.mandateId === this.mandate.id).sort((a, b) => a.receiptId.localeCompare(b.receiptId))[0];
    if (!receipt)
      return void 0;
    const expectedId = createSettlementReceiptId({
      proofVersion: receipt.proofVersion,
      url: receipt.url,
      method: receipt.method,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
      amount: receipt.amount,
      submittedAt: receipt.submittedAt,
      validUntil: receipt.validUntil,
      proof: receipt.proof
    });
    if (receipt.receiptId !== expectedId || receipt.txHash !== receipt.proof.txHash || receipt.mandateId !== receipt.proof.mandateId || !Number.isSafeInteger(receipt.submittedAt) || !Number.isSafeInteger(receipt.validUntil) || receipt.submittedAt <= 0 || receipt.validUntil <= receipt.submittedAt) {
      throw new Error("settlement receipt store returned invalid recovery evidence");
    }
    if (!this.paymentClaimKey)
      this.claimPaymentOperation();
    this.pendingSettlement = Object.freeze({
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
      amount: receipt.amount,
      expectedSeq: "unknown",
      submittedAt: receipt.submittedAt,
      validUntil: receipt.validUntil,
      receiptId: receipt.receiptId
    });
    return receipt;
  }
  /** Execute a mandate-validated payment of `amount` (human, e.g. "1.00").
   *  Reads the current sequence, then calls the contract's `execute_payment`
   *  (agent-signed). Throws if the contract rejects it. Returns the tx hash. */
  async pay(amount, lifecycle) {
    if (!lifecycle || typeof lifecycle.onPrepared !== "function") {
      throw new Error("pay requires an onPrepared durable settlement journal before any network call");
    }
    this.claimPaymentOperation();
    let retainClaim = false;
    try {
      const outstandingReceipt = await this.hydratePendingReceipt();
      if (outstandingReceipt) {
        retainClaim = true;
        throw new DeliveryPendingError(outstandingReceipt, new Error("an unresolved receipt from a prior process must be reconciled or delivered first"));
      }
      if (this.pendingSettlement) {
        retainClaim = true;
        throw new SettlementUncertainError(this.pendingSettlement, new Error("a prior prepared payment has not been reconciled or delivered"));
      }
      const client = registryClient(this.net, this.agentSigner);
      const current = (await client.get_mandate({ mandate_id: this.mandate.idBuffer })).result.unwrap();
      const expectedSeq = resolveExpectedPaymentSequence(current.seq, lifecycle.expectedSeq);
      const at = await client.execute_payment({
        mandate_id: this.mandate.idBuffer,
        amount: toStroops(amount, this.mandate.decimals),
        expected_seq: expectedSeq
      }, { timeoutInSeconds: PAYMENT_TIMEOUT_SECONDS });
      await at.sign();
      const signed = at.signed;
      const txHash = signed?.hash().toString("hex").toLowerCase();
      const validUntil = Number(signed?.timeBounds?.maxTime);
      if (!txHash || !/^[0-9a-f]{64}$/.test(txHash) || !Number.isSafeInteger(validUntil) || validUntil <= 0) {
        this.pendingSettlement = void 0;
        throw new Error("payment signing did not produce a canonical hash and finite validity window");
      }
      this.pendingSettlement = Object.freeze({
        txHash,
        mandateId: this.mandate.id,
        amount,
        expectedSeq: expectedSeq.toString(),
        submittedAt: Math.floor(Date.now() / 1e3),
        validUntil
      });
      try {
        const receiptId = await lifecycle.onPrepared(this.pendingSettlement);
        if (receiptId)
          this.pendingSettlement = Object.freeze({ ...this.pendingSettlement, receiptId });
      } catch (cause) {
        this.pendingSettlement = void 0;
        throw cause;
      }
      let sent;
      try {
        sent = await at.send({
          onSubmitted: (response) => {
            const submittedHash2 = response?.hash?.toLowerCase();
            if (submittedHash2 !== txHash) {
              throw new Error("payment RPC returned a different transaction hash than the signed envelope");
            }
            const receiptId = lifecycle.onSubmitted?.(submittedHash2);
            if (receiptId)
              this.pendingSettlement = Object.freeze({ ...this.pendingSettlement, receiptId });
          }
        });
      } catch (cause) {
        retainClaim = true;
        throw new SettlementUncertainError(this.pendingSettlement, cause);
      }
      try {
        sent.result.unwrap();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        const code = Number((message.match(/Error\(Contract,\s*#(\d+)\)/) ?? [])[1]);
        if (Number.isInteger(code) && FINALIZED_CONTRACT_ERROR_CODES.has(code)) {
          this.pendingSettlement = void 0;
          throw new PaymentRejectedError(this.mandate.id, cause);
        }
        retainClaim = true;
        throw new SettlementUncertainError(this.pendingSettlement, cause);
      }
      const submittedHash = sent.sendTransactionResponse?.hash?.toLowerCase();
      if (submittedHash && submittedHash !== txHash) {
        retainClaim = true;
        throw new SettlementUncertainError(this.pendingSettlement, new Error("payment RPC returned a different hash than the signed transaction"));
      }
      if (lifecycle.holdUntilDelivery) {
        retainClaim = true;
      } else {
        this.pendingSettlement = void 0;
      }
      return txHash;
    } finally {
      if (!retainClaim)
        this.releasePaymentOperation();
    }
  }
  getPendingSettlement() {
    return this.pendingSettlement;
  }
  /** Query RPC for a previously prepared/submitted transaction without creating
   *  a new one. Pass a durable journal record after process restart. */
  async reconcilePendingSettlement(restored) {
    if (restored) {
      if (restored.mandateId !== this.mandate.id || !/^[0-9a-f]{64}$/.test(restored.txHash) || !/^(?:unknown|\d+)$/.test(restored.expectedSeq) || !Number.isSafeInteger(restored.submittedAt) || !Number.isSafeInteger(restored.validUntil) || restored.submittedAt <= 0 || restored.validUntil <= restored.submittedAt || restored.receiptId !== void 0 && !/^[0-9a-f]{64}$/.test(restored.receiptId)) {
        throw new Error("pending settlement journal record is invalid or belongs to another mandate");
      }
      if (toStroops(restored.amount, this.mandate.decimals) <= 0n) {
        throw new Error("pending settlement journal amount must be positive");
      }
      if (this.pendingSettlement && this.pendingSettlement.txHash !== restored.txHash) {
        throw new Error("a different pending settlement is already locked on this agent");
      }
      this.pendingSettlement = Object.freeze({ ...restored });
    }
    if (!this.paymentClaimKey)
      this.claimPaymentOperation();
    try {
      await this.hydratePendingReceipt();
    } catch (error) {
      if (!this.pendingSettlement)
        this.releasePaymentOperation();
      throw error;
    }
    const settlement2 = this.pendingSettlement;
    if (!settlement2) {
      this.releasePaymentOperation();
      return { kind: "none" };
    }
    const server = new rpc4.Server(this.net.rpcUrl, { allowHttp: this.net.rpcUrl.startsWith("http://") });
    const response = await server.getTransaction(settlement2.txHash);
    if (response.status === rpc4.Api.GetTransactionStatus.NOT_FOUND) {
      if (settlement2.submittedAt > 0 && settlement2.validUntil > 0 && response.latestLedgerCloseTime > settlement2.validUntil && response.oldestLedgerCloseTime <= settlement2.submittedAt) {
        this.pendingSettlement = void 0;
        if (settlement2.receiptId)
          await this.receiptStore?.clearPending(settlement2.receiptId);
        this.releasePaymentOperation();
        return { kind: "expired", settlement: settlement2 };
      }
      return { kind: "pending", settlement: settlement2 };
    }
    if (response.status === rpc4.Api.GetTransactionStatus.FAILED) {
      this.pendingSettlement = void 0;
      if (settlement2.receiptId)
        await this.receiptStore?.clearPending(settlement2.receiptId);
      this.releasePaymentOperation();
      return { kind: "failed", settlement: settlement2 };
    }
    if (response.status === rpc4.Api.GetTransactionStatus.SUCCESS) {
      if (!settlement2.receiptId) {
        this.pendingSettlement = void 0;
        this.releasePaymentOperation();
      }
      return { kind: "succeeded", settlement: settlement2, deliveryPending: Boolean(settlement2.receiptId) };
    }
    return { kind: "pending", settlement: settlement2 };
  }
  /**
   * Retry delivery with an already-settled proof. This method never calls
   * `pay`, never signs, and never creates another on-chain transaction.
   */
  async retryDelivery(receipt, init) {
    if (!this.receiptStore)
      throw new Error("a SettlementReceiptStore is required to retry delivery safely");
    if (receipt.mandateId !== this.mandate.id || receipt.proof.mandateId !== this.mandate.id) {
      throw new Error("x402: settlement receipt belongs to a different mandate");
    }
    if (receipt.txHash !== receipt.proof.txHash) {
      throw new Error("x402: settlement receipt fields do not match its proof");
    }
    if (!Number.isSafeInteger(receipt.submittedAt) || !Number.isSafeInteger(receipt.validUntil) || receipt.submittedAt <= 0 || receipt.validUntil <= receipt.submittedAt) {
      throw new Error("x402: settlement receipt has an invalid transaction validity window");
    }
    const proof = receipt.proof;
    const bound = isBoundPaymentProof(proof);
    if (receipt.proofVersion === 2 !== bound) {
      throw new Error("x402: settlement receipt proof version is inconsistent");
    }
    const expectedReceiptId = createSettlementReceiptId({
      proofVersion: receipt.proofVersion,
      url: receipt.url,
      method: receipt.method,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
      amount: receipt.amount,
      submittedAt: receipt.submittedAt,
      validUntil: receipt.validUntil,
      proof
    });
    if (receipt.receiptId !== expectedReceiptId) {
      throw new Error("x402: settlement receipt integrity check failed");
    }
    if (!isBoundPaymentProof(proof) && receipt.amount !== proof.amount) {
      throw new Error("x402: settlement receipt amount does not match its proof");
    }
    const method = (init?.method ?? receipt.method).toUpperCase();
    if (method !== receipt.method.toUpperCase()) {
      throw new Error("x402: delivery retry method does not match its settlement receipt");
    }
    if (bound) {
      const target = new URL(receipt.url);
      const resource = `${target.pathname}${target.search}`;
      if (proof.challenge.method !== method || proof.challenge.resource !== resource || proof.challenge.audience !== target.origin) {
        throw new Error("x402: bound receipt does not match its delivery target");
      }
    }
    if (!this.paymentClaimKey)
      this.claimPaymentOperation();
    const headers = new Headers(init?.headers);
    headers.set(X_PAYMENT_HEADER, encodePaymentProof(proof));
    if (receipt.proofVersion === 2) {
      headers.set(ACKRATE_PAYMENT_CAPABILITIES_HEADER, BOUND_PAYMENT_CAPABILITY);
    }
    let delivered;
    try {
      delivered = await fetch(receipt.url, {
        ...init,
        method,
        // Settlement proofs are bearer material. Never forward one across a
        // redirect; the caller may explicitly start a new request to a new URL.
        redirect: "manual",
        headers
      });
      if (!delivered.ok) {
        throw new Error(`merchant returned HTTP ${delivered.status} after settlement`);
      }
      await delivered.clone().arrayBuffer();
      deliveredReceipts.set(delivered, receipt);
      return delivered;
    } catch (cause) {
      throw cause instanceof DeliveryPendingError ? cause : new DeliveryPendingError(receipt, cause);
    }
  }
  /**
   * Application-level delivery commit. Call only after the complete response
   * has been validated and any business result is durably recorded. Until this
   * succeeds, the retained receipt keeps every new payment fail-closed.
   */
  async acknowledgeDelivery(receipt) {
    if (!this.receiptStore)
      throw new Error("a SettlementReceiptStore is required to acknowledge delivery");
    if (receipt.mandateId !== this.mandate.id || receipt.proof.mandateId !== this.mandate.id) {
      throw new Error("x402: cannot acknowledge a receipt for another mandate");
    }
    if (receipt.txHash !== receipt.proof.txHash || !Number.isSafeInteger(receipt.submittedAt) || !Number.isSafeInteger(receipt.validUntil) || receipt.submittedAt <= 0 || receipt.validUntil <= receipt.submittedAt) {
      throw new Error("x402: cannot acknowledge invalid settlement evidence");
    }
    const expectedId = createSettlementReceiptId({
      proofVersion: receipt.proofVersion,
      url: receipt.url,
      method: receipt.method,
      txHash: receipt.txHash,
      mandateId: receipt.mandateId,
      amount: receipt.amount,
      submittedAt: receipt.submittedAt,
      validUntil: receipt.validUntil,
      proof: receipt.proof
    });
    if (receipt.receiptId !== expectedId) {
      throw new Error("x402: cannot acknowledge a receipt with an invalid integrity id");
    }
    try {
      await this.receiptStore.clearPending(receipt.receiptId);
    } catch (cause) {
      throw new DeliveryPendingError(receipt, cause);
    }
    if (this.pendingSettlement?.txHash === receipt.txHash)
      this.pendingSettlement = void 0;
    this.releasePaymentOperation();
  }
  /**
   * x402 round-trip. GET `url`; if the server answers 402 Payment Required, read
   * the payment requirement, settle it on-chain via `execute_payment` (the same
   * path as `pay`), and retry the request with an `X-PAYMENT` settlement proof.
   * Returns the final `Response`.
   *
   * The contract is the enforcer; `fetch` never bypasses it. The payment always
   * goes through `pay` -> `execute_payment`, so a revoked, expired, out-of-scope,
   * or over-budget request is rejected on-chain and `fetch` throws. The 402 body
   * is only a hint: the merchant independently verifies the on-chain payment
   * before serving the resource.
   */
  async fetch(url, init) {
    const outstandingReceipt = await this.hydratePendingReceipt();
    if (outstandingReceipt) {
      throw new DeliveryPendingError(outstandingReceipt, new Error("recover the durable receipt from the prior process before starting another fetch"));
    }
    if (this.pendingSettlement) {
      throw new SettlementUncertainError(this.pendingSettlement, new Error("reconcile or recover the prior payment before starting another fetch"));
    }
    const firstHeaders = new Headers(init?.headers);
    firstHeaders.set(ACKRATE_PAYMENT_CAPABILITIES_HEADER, BOUND_PAYMENT_CAPABILITY);
    const first = await fetch(url, {
      ...init,
      // Refuse automatic redirects before payment so a challenge cannot move
      // the payment flow onto a different origin behind the SDK's back.
      redirect: "manual",
      headers: firstHeaders
    });
    if (first.status === 426) {
      throw new Error("x402: merchant requires a payment proof capability this SDK cannot negotiate");
    }
    if (first.status !== 402)
      return first;
    const required = await parse402(first);
    const receiptStore = this.receiptStore;
    if (!receiptStore) {
      throw new Error("x402: a SettlementReceiptStore is required before submitting a paid request");
    }
    if (required.payTo !== this.mandate.merchant) {
      throw new Error(`x402: the 402 names merchant ${required.payTo}, not this mandate's merchant ${this.mandate.merchant}`);
    }
    if (required.asset && required.asset !== this.mandate.asset) {
      throw new Error(`x402: the 402 names a different asset than this mandate's`);
    }
    if (this.proofPolicy === "bound-v2-only" && (!required.challenge || required.proofVersion !== 2)) {
      throw new Error("x402: bound-v2-only agent refused a legacy payment challenge before paying");
    }
    if (required.challenge) {
      if (!this.agentSigner.signPayload) {
        throw new Error("x402: the external agent signer cannot sign a bound payment proof");
      }
      const method = (init?.method ?? "GET").toUpperCase();
      const target = new URL(url);
      const resource = `${target.pathname}${target.search}`;
      const now = Math.floor(Date.now() / 1e3);
      const expectedNetworkId = hash2(Buffer5.from(this.net.networkPassphrase, "utf8")).toString("hex");
      if (required.scheme !== BOUND_PAYMENT_SCHEME || required.challenge.scheme !== BOUND_PAYMENT_SCHEME) {
        throw new Error("x402: bound challenge uses an unsupported payment scheme");
      }
      if (method !== "GET") {
        throw new Error("x402: bound-v2 currently permits only GET requests");
      }
      if (required.challenge.audience !== target.origin || required.challenge.method !== method || required.challenge.resource !== resource || required.resource !== resource || required.challenge.bodySha256 !== null) {
        throw new Error("x402: bound challenge does not match this exact request");
      }
      if (required.challenge.registryId !== this.net.mandateRegistryId || required.contract !== this.net.mandateRegistryId || required.challenge.networkId !== expectedNetworkId) {
        throw new Error("x402: bound challenge names a different MandateRegistry");
      }
      if (required.challenge.merchant !== this.mandate.merchant || required.challenge.asset !== this.mandate.asset || required.challenge.network !== required.network || required.challenge.amountStroops !== toStroops(required.amount, required.challenge.decimals).toString() || required.challenge.decimals !== this.mandate.decimals) {
        throw new Error("x402: bound challenge does not match this mandate or network");
      }
      if (required.challenge.expiresAt <= now || required.challenge.issuedAt > now + 60) {
        throw new Error("x402: bound challenge is expired or not yet valid");
      }
    }
    let receipt;
    const makeReceipt = async (txHash2, timing = {
      submittedAt: Math.floor(Date.now() / 1e3),
      validUntil: Math.floor(Date.now() / 1e3) + PAYMENT_TIMEOUT_SECONDS
    }) => {
      const proof = Object.freeze(required.challenge ? await createBoundPaymentProofWithSigner({
        challenge: required.challenge,
        txHash: txHash2,
        mandateId: this.mandate.id,
        signer: {
          publicKey: this.agentSigner.publicKey,
          signPayload: this.agentSigner.signPayload
        }
      }) : {
        scheme: required.scheme,
        network: required.network,
        txHash: txHash2,
        mandateId: this.mandate.id,
        amount: required.amount
      });
      const receiptWithoutId = Object.freeze({
        proofVersion: isBoundPaymentProof(proof) ? 2 : 1,
        url,
        method: (init?.method ?? "GET").toUpperCase(),
        txHash: txHash2,
        mandateId: this.mandate.id,
        amount: required.amount,
        submittedAt: timing.submittedAt,
        validUntil: timing.validUntil,
        proof
      });
      return Object.freeze({
        receiptId: createSettlementReceiptId(receiptWithoutId),
        ...receiptWithoutId
      });
    };
    let txHash;
    try {
      txHash = await this.pay(required.amount, {
        holdUntilDelivery: true,
        onPrepared: async (prepared) => {
          receipt = await makeReceipt(prepared.txHash, prepared);
          await receiptStore.savePending(receipt);
          return receipt.receiptId;
        }
      });
    } catch (cause) {
      if (cause instanceof SettlementUncertainError) {
        this.pendingSettlement ??= cause.settlement;
        receipt ??= await makeReceipt(cause.settlement.txHash, cause.settlement);
        throw new DeliveryPendingError(receipt, cause);
      }
      if (receipt) {
        await receiptStore.clearPending(receipt.receiptId).catch(() => void 0);
      }
      throw cause;
    }
    receipt ??= await makeReceipt(txHash);
    if (!this.pendingSettlement) {
      this.pendingSettlement = Object.freeze({
        txHash,
        mandateId: this.mandate.id,
        amount: required.amount,
        expectedSeq: "confirmed",
        submittedAt: receipt.submittedAt,
        validUntil: receipt.validUntil,
        receiptId: receipt.receiptId
      });
      try {
        await receiptStore.savePending(receipt);
      } catch (cause) {
        throw new DeliveryPendingError(receipt, cause);
      }
    }
    return this.retryDelivery(receipt, init);
  }
};
var ackrate = {
  testnet: TESTNET,
  /** Build an AP2-style IntentMandate and its canonical id (no chain calls). */
  createIntentMandate(input, net = TESTNET) {
    void net;
    if (!Number.isInteger(input.expiry) || input.expiry <= 0 || input.expiry > MAX_EXPIRY) {
      throw new Error(`expiry must be a positive integer of Unix seconds (got ${input.expiry}).`);
    }
    const decimals2 = input.decimals ?? DEFAULT_DECIMALS;
    const nonce = input.nonce ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const maxAmount = String(input.maxAmount).trim();
    const canonical = JSON.stringify({
      user: input.user,
      agent: input.agent,
      merchant: input.merchant,
      asset: input.asset,
      maxAmount,
      expiry: input.expiry,
      nonce
    });
    const idBuffer = hash2(Buffer5.from(canonical, "utf8"));
    return {
      id: idBuffer.toString("hex"),
      idBuffer,
      user: input.user,
      agent: input.agent,
      merchant: input.merchant,
      asset: input.asset,
      maxAmount: toStroops(maxAmount, decimals2),
      expiry: input.expiry,
      decimals: decimals2
    };
  },
  /** Register the mandate on-chain (user-signed). */
  async registerMandate(mandate2, opts, net = TESTNET) {
    const signer = mandateUserSigner(mandate2, opts.signer, net);
    const client = registryClient(net, signer);
    const at = await client.register_mandate({
      user: mandate2.user,
      agent: mandate2.agent,
      merchant: mandate2.merchant,
      asset: mandate2.asset,
      max_amount: mandate2.maxAmount,
      expiry: BigInt(mandate2.expiry),
      vc_hash: mandate2.idBuffer
    });
    const sent = await at.signAndSend();
    sent.result.unwrap();
    return sent.sendTransactionResponse?.hash ?? "";
  },
  /** Approve the contract for a SEP-41 allowance up to the mandate budget (user-signed). */
  async approveBudget(mandate2, opts, net = TESTNET) {
    return token_exports.approve(net, mandate2.asset, mandateUserSigner(mandate2, opts.signer, net), net.mandateRegistryId, mandate2.maxAmount);
  },
  /** Revoke the mandate (user-signed). After this, `pay` is rejected on-chain. */
  async revokeMandate(mandate2, opts, net = TESTNET) {
    const signer = mandateUserSigner(mandate2, opts.signer, net);
    const client = registryClient(net, signer);
    const at = await client.revoke_mandate({ mandate_id: mandate2.idBuffer });
    const sent = await at.signAndSend();
    sent.result.unwrap();
    return sent.sendTransactionResponse?.hash ?? "";
  },
  /** Bind an agent to a registered mandate. */
  agent(opts, net = TESTNET) {
    const signer = stellarSigner(opts.signer, net.networkPassphrase);
    if (signer.publicKey !== opts.mandate.agent) {
      throw new Error("the transaction signer must match the mandate agent");
    }
    return new Agent(net, opts.mandate, signer, opts.proofPolicy, opts.receiptStore);
  }
};

// packages/cli/src/mandate-store.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, existsSync as existsSync3 } from "node:fs";
import { join as join2 } from "node:path";
function mandatePath() {
  return join2(ackrateHome(), "mandate.json");
}
function mandateExists() {
  return existsSync3(mandatePath());
}
function loadMandate() {
  return JSON.parse(readFileSync3(mandatePath(), "utf8"));
}
function saveMandate(m) {
  const path = mandatePath();
  writeFileSync3(path, JSON.stringify(m, null, 2) + "\n", { mode: 384 });
  return path;
}

// packages/cli/src/commands/mandate.ts
var short2 = (s) => s ? `${s.slice(0, 6)}\u2026${s.slice(-4)}` : "";
async function runMandateCreate(opts = {}) {
  if (!configExists()) {
    log.warn("no ackrate.config.json here \u2014 run `ackrate init` first");
    return;
  }
  if (!credentialsExist()) {
    log.warn("no credentials \u2014 run `ackrate setup` first");
    return;
  }
  if (mandateExists() && !opts.force) {
    log.warn("a mandate already exists \u2014 re-run with --force to replace it");
    return;
  }
  const config = loadConfig();
  const net = networkConfig(config);
  const creds = loadCredentials();
  const txUrl = (hash3) => `${config.explorer}/tx/${hash3}`;
  const budget = opts.budget ?? config.budget;
  const expirySecs = opts.expiry ? Number(opts.expiry) : 3600;
  if (!Number.isFinite(expirySecs) || expirySecs <= 0) {
    log.err("--expiry must be a positive number of seconds");
    return;
  }
  const inputs = {
    user: creds.userPublic,
    agent: creds.agentPublic,
    merchant: creds.merchantPublic,
    asset: ackrate.testnet.nativeSac,
    maxAmount: budget,
    expiry: Math.floor(Date.now() / 1e3) + expirySecs,
    nonce: `${Date.now()}:${Math.random().toString(36).slice(2)}`
  };
  const mandate2 = ackrate.createIntentMandate(inputs);
  log.step("authorizing mandate", {
    budget: `${budget} XLM`,
    merchant: short2(creds.merchantPublic),
    id: short2(mandate2.id)
  });
  const registerTx = await ackrate.registerMandate(mandate2, { signer: creds.userSecret }, net);
  log.chain("register_mandate confirmed", { tx: short2(registerTx) });
  const approveTx = await ackrate.approveBudget(mandate2, { signer: creds.userSecret }, net);
  log.chain("approveBudget confirmed (SEP-41 allowance to contract)", { tx: short2(approveTx) });
  const stored = { inputs, id: mandate2.id, registerTx, approveTx };
  const path = saveMandate(stored);
  log.ok("mandate saved", { path });
  console.log(
    "\n" + c.bold("Mandate") + "\n" + c.gray("  id        ") + c.white(mandate2.id) + "\n" + c.gray("  budget    ") + c.white(`${budget} XLM`) + "\n" + c.gray("  register  ") + c.dim(txUrl(registerTx)) + "\n" + c.gray("  approve   ") + c.dim(txUrl(approveTx)) + "\n"
  );
  log.info("next", { run: "ackrate pay" });
}

// packages/cli/src/settlement-store.ts
import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm
} from "node:fs/promises";
import { join as join3 } from "node:path";
var DIRECTORY = "pending-settlement";
var STATE = "state.json";
function settlementDirectory() {
  return join3(ackrateHome(), DIRECTORY);
}
function statePath() {
  return join3(settlementDirectory(), STATE);
}
function exactKeys2(value, expected) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function validatePending(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pending settlement record is not an object");
  }
  const pending = value;
  const keys = ["txHash", "mandateId", "amount", "expectedSeq", "submittedAt", "validUntil"];
  if (pending.receiptId !== void 0) keys.push("receiptId");
  if (!exactKeys2(pending, keys) || typeof pending.txHash !== "string" || !/^[0-9a-f]{64}$/.test(pending.txHash) || typeof pending.mandateId !== "string" || !/^[0-9a-f]{64}$/.test(pending.mandateId) || typeof pending.amount !== "string" || !/^\d+(?:\.\d+)?$/.test(pending.amount) || typeof pending.expectedSeq !== "string" || !/^\d+$/.test(pending.expectedSeq) || !Number.isSafeInteger(pending.submittedAt) || !Number.isSafeInteger(pending.validUntil) || pending.submittedAt <= 0 || pending.validUntil <= pending.submittedAt || pending.receiptId !== void 0 && !/^[0-9a-f]{64}$/.test(pending.receiptId)) {
    throw new Error("pending settlement record schema is invalid");
  }
  return Object.freeze({ ...pending });
}
function validateRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("settlement journal is not an object");
  }
  const raw = value;
  const legacy = raw.version === 2 && raw.network === "testnet";
  const record = legacy ? { ...raw, version: 3, rpcUrl: TESTNET.rpcUrl } : raw;
  const expectedKeys = record.state === "completed" ? ["version", "state", "source", "network", "rpcUrl", "contractId", "pending", "completedAt"] : ["version", "state", "source", "network", "rpcUrl", "contractId", "pending"];
  let rpc7;
  try {
    rpc7 = new URL(record.rpcUrl);
  } catch {
  }
  if (!exactKeys2(record, expectedKeys) || record.version !== 3 || record.state !== "pending" && record.state !== "completed" || record.source !== "pay" && record.source !== "demo" || record.network !== "testnet" && record.network !== "mainnet" || !rpc7 || rpc7.protocol !== "https:" || Boolean(rpc7.username || rpc7.password) || typeof record.contractId !== "string" || !/^C[A-Z2-7]{55}$/.test(record.contractId)) {
    throw new Error("settlement journal schema is invalid");
  }
  const pending = validatePending(record.pending);
  if (record.state === "completed") {
    if (!Number.isSafeInteger(record.completedAt) || record.completedAt < pending.submittedAt) {
      throw new Error("completed settlement journal schema is invalid");
    }
    return Object.freeze({ ...record, pending });
  }
  return Object.freeze({ ...record, pending });
}
async function assertDirectoryIsPrivate(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("settlement journal path is not a private directory");
  }
  if ((info.mode & 63) !== 0) {
    throw new Error("settlement journal directory permissions are not private");
  }
}
async function assertNoPendingSettlement() {
  try {
    await lstat(settlementDirectory());
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw new Error("a payment is unresolved or unacknowledged; run `ackrate settlement reconcile` before another payment");
}
async function writeState(record) {
  const directory = settlementDirectory();
  const temporary = join3(directory, `${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 384);
    await handle.writeFile(`${JSON.stringify(record, null, 2)}
`, "utf8");
    await handle.sync();
    await handle.close();
    handle = void 0;
    await rename(temporary, statePath());
    await chmod(statePath(), 384);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await handle?.close().catch(() => void 0);
    await rm(temporary, { force: true }).catch(() => void 0);
  }
}
async function claimPendingSettlement(source, contractId, pending, context = {
  network: "testnet",
  rpcUrl: TESTNET.rpcUrl
}) {
  const home = ackrateHome();
  await mkdir(home, { recursive: true, mode: 448 });
  await chmod(home, 448);
  const directory = settlementDirectory();
  try {
    await mkdir(directory, { mode: 448 });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error("another prepared payment is unresolved; run `ackrate settlement reconcile`");
    }
    throw error;
  }
  try {
    const record = validateRecord({
      version: 3,
      state: "pending",
      source,
      network: context.network,
      rpcUrl: context.rpcUrl,
      contractId,
      pending
    });
    await writeState(record);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
async function loadPendingSettlement() {
  const directory = settlementDirectory();
  try {
    await assertDirectoryIsPrivate(directory);
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "none" };
    throw error;
  }
  let raw;
  try {
    raw = await readFile(statePath(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "empty" };
    throw error;
  }
  const info = await lstat(statePath());
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 63) !== 0) {
    throw new Error("settlement journal file is not a private regular file");
  }
  const record = validateRecord(JSON.parse(raw));
  return record.state === "completed" ? { kind: "completed", record } : { kind: "pending", record };
}
async function clearPendingSettlement(expectedTxHash) {
  const loaded = await loadPendingSettlement();
  if (loaded.kind === "none") return;
  if (loaded.kind === "completed") {
    throw new Error("refusing to clear a completed payment before explicit acknowledgment");
  }
  if (loaded.kind === "pending" && expectedTxHash !== void 0 && loaded.record.pending.txHash !== expectedTxHash) {
    throw new Error("refusing to clear a different pending settlement hash");
  }
  if (loaded.kind === "empty" && expectedTxHash !== void 0) {
    throw new Error("refusing hash-specific clear of an empty pre-broadcast claim");
  }
  await rm(settlementDirectory(), { recursive: true, force: true });
}
async function markSettlementCompleted(expectedTxHash) {
  if (!/^[0-9a-f]{64}$/.test(expectedTxHash)) {
    throw new Error("completed settlement hash must be canonical 64-character lowercase hex");
  }
  const loaded = await loadPendingSettlement();
  if (loaded.kind === "none" || loaded.kind === "empty") {
    throw new Error("cannot complete a settlement without its durable prepared record");
  }
  if (loaded.record.pending.txHash !== expectedTxHash) {
    throw new Error("refusing to complete a different settlement hash");
  }
  if (loaded.kind === "completed") return;
  const completed = validateRecord({
    ...loaded.record,
    state: "completed",
    completedAt: Math.max(Math.floor(Date.now() / 1e3), loaded.record.pending.submittedAt)
  });
  await writeState(completed);
}
async function acknowledgeCompletedSettlement(expectedTxHash) {
  if (!/^[0-9a-f]{64}$/.test(expectedTxHash)) {
    throw new Error("acknowledgment hash must be canonical 64-character lowercase hex");
  }
  const loaded = await loadPendingSettlement();
  if (loaded.kind !== "completed") {
    throw new Error("no completed payment is awaiting acknowledgment");
  }
  if (loaded.record.pending.txHash !== expectedTxHash) {
    throw new Error("refusing to acknowledge a different completed settlement hash");
  }
  await rm(settlementDirectory(), { recursive: true, force: true });
}
function classifyMissingSettlement(pending, evidence) {
  if (evidence.latestLedgerCloseTime <= pending.validUntil) return "pending";
  if (evidence.oldestLedgerCloseTime > pending.submittedAt) return "history-pruned";
  return "expired";
}

// packages/cli/src/payment-failure.ts
function isFinalPaymentRejection(error) {
  return error instanceof PaymentRejectedError;
}

// packages/cli/src/commands/pay.ts
var short3 = (s) => s ? `${s.slice(0, 6)}\u2026${s.slice(-4)}` : "";
function rejectionSummary(reason) {
  const code = (reason.match(/Error\(Contract,\s*#(\d+)\)/) ?? [])[1];
  switch (code) {
    case "4":
      return "MandateExpired";
    case "5":
      return "MandateRevoked";
    case "6":
      return "BudgetExceeded";
    case "7":
      return "MerchantOutOfScope";
    case "8":
      return "BadSequence";
    case "9":
      return "InvalidAmount";
    default:
      return reason.split("\n")[0] ?? reason;
  }
}
async function runPay(amountArg) {
  try {
    await assertNoPendingSettlement();
  } catch (error) {
    log.err("payment blocked by unresolved journal state", {
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
    return;
  }
  if (!configExists()) {
    log.warn("no ackrate.config.json here \u2014 run `ackrate init` first");
    return;
  }
  if (!credentialsExist()) {
    log.warn("no credentials \u2014 run `ackrate setup` first");
    return;
  }
  if (!mandateExists()) {
    log.warn("no mandate \u2014 run `ackrate mandate create` first");
    return;
  }
  const config = loadConfig();
  const net = networkConfig(config);
  const creds = loadCredentials();
  const stored = loadMandate();
  const txUrl = (hash4) => `${config.explorer}/tx/${hash4}`;
  const amount = amountArg ?? config.unlockPrice;
  const mandate2 = ackrate.createIntentMandate(stored.inputs);
  log.step("execute_payment (agent-signed)", { amount: `${amount} XLM`, mandate: short3(mandate2.id) });
  let preparedHash;
  let hash3;
  try {
    hash3 = await ackrate.agent({ mandate: mandate2, signer: creds.agentSecret }, net).pay(amount, {
      onPrepared: async (pending) => {
        await claimPendingSettlement("pay", net.mandateRegistryId, pending);
        preparedHash = pending.txHash;
      }
    });
  } catch (err) {
    if (err instanceof SettlementUncertainError) {
      log.err("payment result is uncertain; durable journal retained", { tx: short3(err.settlement.txHash) });
      log.info("run `ackrate settlement reconcile`; do not run pay again");
      console.log(c.dim(`  ${txUrl(err.settlement.txHash)}`));
      process.exitCode = 1;
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    if (isFinalPaymentRejection(err)) {
      if (preparedHash) {
        try {
          await clearPendingSettlement(preparedHash);
        } catch (clearError) {
          log.err("final rejection was observed but its durable journal could not be cleared", {
            reason: clearError instanceof Error ? clearError.message : String(clearError)
          });
          process.exitCode = 1;
          return;
        }
      }
      log.err("payment rejected by the contract", { reason: rejectionSummary(reason) });
      log.info("budget, expiry, and replay are enforced on-chain \u2014 the CLI cannot override them");
    } else if (preparedHash) {
      log.err("payment result is uncertain; durable journal retained", { tx: short3(preparedHash) });
      log.info("run `ackrate settlement reconcile`; do not run pay again");
    } else {
      log.err("payment failed before a transaction hash was durably prepared", {
        reason: reason.split("\n")[0]
      });
    }
    process.exitCode = 1;
    return;
  }
  try {
    await markSettlementCompleted(hash3);
  } catch (error) {
    log.err("payment succeeded but completion could not be durably recorded", {
      tx: short3(hash3),
      reason: error instanceof Error ? error.message : String(error)
    });
    log.info("run `ackrate settlement reconcile`; do not run pay again");
    process.exitCode = 1;
    return;
  }
  log.chain("payment settled on-chain; durable acknowledgment is required", { tx: short3(hash3) });
  console.log(
    "\n" + c.bold("Payment") + "\n" + c.gray("  amount  ") + c.white(`${amount} XLM`) + "\n" + c.gray("  tx      ") + c.dim(txUrl(hash3)) + "\n"
  );
  log.info(`after you durably accept this result, run \`ackrate settlement acknowledge ${hash3}\``);
}

// packages/cli/src/commands/demo.ts
import { readFileSync as readFileSync4 } from "node:fs";
import { Keypair as Keypair4, Networks as Networks2, StrKey as StrKey4, rpc as rpc5 } from "@stellar/stellar-sdk";

// packages/cli/src/stellar-cli-signer.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StrKey as StrKey3 } from "@stellar/stellar-sdk";
var execute = promisify(execFile);
function identityName(value) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || /[\r\n\0]/.test(normalized)) {
    throw new Error("Stellar signer identity must be a non-empty local identity name");
  }
  return normalized;
}
async function stellar(args) {
  try {
    const { stdout } = await execute("stellar", args, {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 18e4
    });
    return stdout.trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Stellar CLI signer failed: ${detail}`);
  }
}
async function stellarCliSigner(identityInput, net) {
  const identity = identityName(identityInput);
  const publicKey = await stellar(["keys", "public-key", identity, "--quiet"]);
  if (!StrKey3.isValidEd25519PublicKey(publicKey)) {
    throw new Error(`Stellar identity ${JSON.stringify(identity)} did not resolve to a G-account`);
  }
  const signTransaction = async (xdr, options) => {
    if (options?.networkPassphrase && options.networkPassphrase !== net.networkPassphrase) {
      throw new Error("external signer refused a conflicting network passphrase");
    }
    if (options?.address && options.address !== publicKey) {
      throw new Error("external signer refused a transaction for another account");
    }
    const signedTxXdr = await stellar([
      "tx",
      "sign",
      xdr,
      "--sign-with-key",
      identity,
      "--network-passphrase",
      net.networkPassphrase,
      "--rpc-url",
      net.rpcUrl,
      "--quiet"
    ]);
    if (!signedTxXdr) throw new Error("Stellar CLI signer returned an empty transaction envelope");
    return { signedTxXdr, signerAddress: publicKey };
  };
  return Object.freeze({
    publicKey,
    signTransaction
  });
}

// packages/cli/src/commands/demo.ts
var SOURCES = [
  { name: "Market Data API", icon: "\u{1F4C8}" },
  { name: "Academic Papers", icon: "\u{1F4DA}" },
  { name: "News Archive", icon: "\u{1F4F0}" },
  { name: "Patent Database", icon: "\u2697\uFE0F" },
  { name: "Analyst Reports", icon: "\u{1F3E6}" }
];
var SOURCE_PRICE = "1.00";
var BUDGET = "3.00";
var short4 = (s) => s ? `${s.slice(0, 6)}\u2026${s.slice(-4)}` : "";
var sleep3 = (ms) => new Promise((r) => setTimeout(r, ms));
async function fund2(pub) {
  const server = new rpc5.Server(TESTNET.rpcUrl);
  for (let round = 0; round < 4; round += 1) {
    await fetch(`https://friendbot.stellar.org/?addr=${pub}`).catch(() => void 0);
    for (let i = 0; i < 8; i += 1) {
      try {
        await server.getAccount(pub);
        return;
      } catch {
      }
      await sleep3(1e3);
    }
  }
  throw new Error(`friendbot could not fund ${pub} after several attempts`);
}
async function waitForSeq(client, idBuffer, target, tries = 20) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const md = (await client.get_mandate({ mandate_id: idBuffer })).result.unwrap();
      if (Number(md.seq) >= target) return;
    } catch {
    }
    await sleep3(1e3);
  }
  throw new Error(`mandate sequence did not reach ${target} before the RPC read deadline`);
}
async function attemptPurchase(agent, runtime) {
  let preparedHash;
  try {
    const hash3 = await agent.pay(runtime.price, {
      onPrepared: async (pending) => {
        await claimPendingSettlement("demo", runtime.net.mandateRegistryId, pending, {
          network: runtime.network,
          rpcUrl: runtime.net.rpcUrl
        });
        preparedHash = pending.txHash;
      }
    });
    await markSettlementCompleted(hash3);
    return { kind: "ok", hash: hash3 };
  } catch (e) {
    if (e instanceof SettlementUncertainError) {
      return {
        kind: "uncertain",
        msg: `transaction ${e.settlement.txHash} is unresolved; run ackrate settlement reconcile`
      };
    }
    if (isFinalPaymentRejection(e) && preparedHash) {
      try {
        await clearPendingSettlement(preparedHash);
      } catch (clearError) {
        return {
          kind: "uncertain",
          msg: `journal clear failed: ${clearError instanceof Error ? clearError.message : String(clearError)}`
        };
      }
    }
    if (preparedHash && !isFinalPaymentRejection(e)) {
      return {
        kind: "uncertain",
        msg: `transaction ${preparedHash} has an unknown post-prepare result; run ackrate settlement reconcile`
      };
    }
    const msg = e instanceof Error ? e.message : String(e);
    const code = (msg.match(/Error\(Contract,\s*#(\d+)\)/) ?? [])[1];
    if (code === "6") return { kind: "blocked" };
    if (code === "8") return { kind: "retry" };
    return { kind: "error", msg: (msg.split("\n")[0] ?? msg).slice(0, 90) };
  }
}
var DEMOS = [
  {
    id: "research-agent",
    summary: "An agent buys research sources on-chain; testnet uses XLM, while explicit manifest-gated mainnet mode uses real USDC."
  }
];
function listDemos() {
  console.log("\n" + banner() + "\n");
  log.info("available demos");
  for (const d of DEMOS) {
    log.step(d.id, { run: `ackrate demo ${d.id} --network testnet` });
    console.log("  " + c.gray(d.summary));
  }
  console.log();
}
var explorerTx = (network, hash3) => `https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${hash3}`;
function amountText(value, decimals2) {
  const unit = 10n ** BigInt(decimals2);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
async function testnetRuntime() {
  const user = Keypair4.random();
  const agent = Keypair4.random();
  const merchant = Keypair4.random();
  log.step("funding 3 ephemeral testnet accounts via friendbot");
  await Promise.all([fund2(user.publicKey()), fund2(agent.publicKey()), fund2(merchant.publicKey())]);
  log.chain("accounts funded", {
    user: short4(user.publicKey()),
    agent: short4(agent.publicKey()),
    merchant: short4(merchant.publicKey())
  });
  return Object.freeze({
    network: "testnet",
    net: TESTNET,
    userSigner: keypairSigner(user, TESTNET.networkPassphrase),
    agentSigner: keypairSigner(agent, TESTNET.networkPassphrase),
    merchant: merchant.publicKey(),
    asset: TESTNET.nativeSac,
    symbol: "XLM",
    budget: BUDGET,
    price: SOURCE_PRICE,
    decimals: 7
  });
}
function requireMainnetText(value, flag) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`mainnet demo requires ${flag}`);
  return normalized;
}
async function mainnetRuntime(options) {
  if (!options.confirmRealUsdc) {
    throw new Error("mainnet demo requires --confirm-real-usdc to acknowledge an irreversible real-USDC payment");
  }
  const manifestPath = requireMainnetText(options.manifest, "--manifest <path>");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync4(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`could not read the mainnet deployment manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  const net = mainnetNetworkFromDeploymentManifest(manifest);
  const merchant = requireMainnetText(options.merchant, "--merchant <G...>");
  if (!StrKey4.isValidEd25519PublicKey(merchant)) {
    throw new Error("--merchant must be a Stellar G-account");
  }
  const budget = requireMainnetText(options.budget, "--budget <usdc>");
  const price = requireMainnetText(options.price, "--price <usdc>");
  const budgetUnits = toStroops(budget, net.settlementAsset.decimals);
  const priceUnits = toStroops(price, net.settlementAsset.decimals);
  if (priceUnits <= 0n || budgetUnits < priceUnits * 3n || budgetUnits >= priceUnits * 4n) {
    throw new Error("mainnet demo budget must cover exactly three prices and reject the fourth");
  }
  const [userSigner, agentSigner] = await Promise.all([
    stellarCliSigner(requireMainnetText(options.userSigner, "--user-signer <stellar-identity>"), net),
    stellarCliSigner(requireMainnetText(options.agentSigner, "--agent-signer <stellar-identity>"), net)
  ]);
  if ((/* @__PURE__ */ new Set([userSigner.publicKey, agentSigner.publicKey, merchant])).size !== 3) {
    throw new Error("mainnet user, agent, and merchant accounts must be distinct");
  }
  const server = new rpc5.Server(net.rpcUrl);
  const identity = await server.getNetwork();
  if (identity.passphrase !== Networks2.PUBLIC || net.networkPassphrase !== Networks2.PUBLIC) {
    throw new Error("mainnet RPC identity does not match the public Stellar network");
  }
  await Promise.all([
    server.getAccount(userSigner.publicKey),
    server.getAccount(agentSigner.publicKey),
    server.getAccount(merchant)
  ]);
  const [chainDecimals, userUsdc, userXlm, agentXlm] = await Promise.all([
    token_exports.decimals(net, net.settlementAsset.contractId, userSigner.publicKey),
    token_exports.balance(net, net.settlementAsset.contractId, userSigner.publicKey),
    token_exports.balance(net, net.nativeSac, userSigner.publicKey),
    token_exports.balance(net, net.nativeSac, agentSigner.publicKey)
  ]);
  if (chainDecimals !== net.settlementAsset.decimals) {
    throw new Error(`USDC decimals conflict: manifest=${net.settlementAsset.decimals}, chain=${chainDecimals}`);
  }
  if (userUsdc < budgetUnits) {
    throw new Error(`user USDC balance ${amountText(userUsdc, chainDecimals)} is below budget ${budget}`);
  }
  const feeReserve = toStroops("0.50", 7);
  if (userXlm < feeReserve || agentXlm < feeReserve) {
    throw new Error("mainnet user and agent must each retain at least 0.50 XLM for fees and reserve headroom");
  }
  const reader = registryClient(net, agentSigner);
  if ((await reader.is_paused()).result) {
    throw new Error("mainnet MandateRegistry is paused");
  }
  log.warn("real-value mode confirmed", {
    network: "Stellar mainnet",
    asset: "USDC",
    budget,
    price
  });
  log.chain("mainnet preflight passed", {
    contract: short4(net.mandateRegistryId),
    user: short4(userSigner.publicKey),
    agent: short4(agentSigner.publicKey),
    merchant: short4(merchant)
  });
  return Object.freeze({
    network: "mainnet",
    net,
    userSigner,
    agentSigner,
    merchant,
    asset: net.settlementAsset.contractId,
    symbol: "USDC",
    budget,
    price,
    decimals: chainDecimals
  });
}
async function executeDemo(runtime) {
  const merchantBefore = await token_exports.balance(runtime.net, runtime.asset, runtime.merchant);
  const inputs = {
    user: runtime.userSigner.publicKey,
    agent: runtime.agentSigner.publicKey,
    merchant: runtime.merchant,
    asset: runtime.asset,
    maxAmount: runtime.budget,
    expiry: Math.floor(Date.now() / 1e3) + 3600,
    decimals: runtime.decimals,
    nonce: `${Date.now()}:${Math.random().toString(36).slice(2)}`
  };
  const mandate2 = ackrate.createIntentMandate(inputs, runtime.net);
  const registerTx = await ackrate.registerMandate(mandate2, { signer: runtime.userSigner }, runtime.net);
  const approveTx = await ackrate.approveBudget(mandate2, { signer: runtime.userSigner }, runtime.net);
  log.chain("mandate registered + allowance approved for contract", {
    budget: `${runtime.budget} ${runtime.symbol}`,
    id: short4(mandate2.id),
    register: short4(registerTx),
    approve: short4(approveTx)
  });
  const rclient = registryClient(runtime.net, runtime.agentSigner);
  const paymentAgent = ackrate.agent({ mandate: mandate2, signer: runtime.agentSigner }, runtime.net);
  let purchased = 0;
  let seq = 0;
  let budgetBlocked = false;
  outer: for (const source of SOURCES) {
    log.step(`agent buys ${source.icon} ${source.name}`, { price: `${runtime.price} ${runtime.symbol}` });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await attemptPurchase(paymentAgent, runtime);
      if (result.kind === "ok") {
        seq += 1;
        await waitForSeq(rclient, mandate2.idBuffer, seq);
        purchased += 1;
        log.ok("purchased on-chain", {
          tx: link(explorerTx(runtime.network, result.hash), short4(result.hash))
        });
        await acknowledgeCompletedSettlement(result.hash);
        break;
      }
      if (result.kind === "blocked") {
        budgetBlocked = true;
        log.warn(`contract blocked the purchase \u2014 ${runtime.budget} ${runtime.symbol} budget exhausted`);
        break outer;
      }
      if (result.kind === "retry") {
        await waitForSeq(rclient, mandate2.idBuffer, seq);
        continue;
      }
      if (result.kind === "uncertain") {
        throw new Error(`${result.msg}. Do not restart the demo until reconciliation completes.`);
      }
      throw new Error(`purchase failed: ${result.msg}`);
    }
  }
  const finalMandate = (await rclient.get_mandate({ mandate_id: mandate2.idBuffer })).result.unwrap();
  const merchantAfter = await token_exports.balance(runtime.net, runtime.asset, runtime.merchant);
  const transferred = merchantAfter - merchantBefore;
  const expected = toStroops(runtime.price, runtime.decimals) * 3n;
  const passed = purchased === 3 && budgetBlocked && finalMandate.spent === expected && Number(finalMandate.seq) === 3 && transferred === expected;
  console.log(
    "\n" + c.bold("Result") + "\n" + c.gray("  network    ") + c.white(runtime.network === "mainnet" ? "Stellar mainnet" : "Stellar testnet") + "\n" + c.gray("  purchased  ") + c.white(`${purchased} sources`) + c.gray(" for ") + c.white(`${amountText(expected, runtime.decimals)} ${runtime.symbol}`) + c.gray(" settled on-chain") + "\n" + c.gray("  enforced   ") + c.white(`${runtime.budget} ${runtime.symbol}`) + c.gray(` budget cap \u2014 ${budgetBlocked ? "the contract rejected purchase four" : "expected rejection was not observed"}`) + "\n" + c.gray("  verified   ") + c.white(`${Number(finalMandate.seq)} payments`) + c.gray(` \xB7 ${amountText(transferred, runtime.decimals)} ${runtime.symbol} merchant delta`) + "\n"
  );
  if (!passed) {
    throw new Error(
      `demo evidence mismatch: purchased=${purchased}, blocked=${budgetBlocked}, seq=${Number(finalMandate.seq)}, spent=${finalMandate.spent}, transferred=${transferred}`
    );
  }
}
async function runDemo(target, options = {}) {
  if (!target) {
    listDemos();
    return;
  }
  if (!DEMOS.some((d) => d.id === target)) {
    log.warn(`unknown demo "${target}"`);
    listDemos();
    process.exitCode = 1;
    return;
  }
  try {
    await assertNoPendingSettlement();
  } catch (error) {
    log.err("demo blocked by unresolved payment journal", {
      reason: error instanceof Error ? error.message : String(error)
    });
    log.info("run `ackrate settlement reconcile` before starting another demo");
    process.exitCode = 1;
    return;
  }
  if (options.network !== void 0 && options.network !== "testnet" && options.network !== "mainnet") {
    throw new Error("--network must be testnet or mainnet");
  }
  const network = options.network ?? "testnet";
  console.log("\n" + banner(network === "mainnet" ? "stellar mainnet \xB7 real USDC" : "stellar testnet \xB7 XLM") + "\n");
  log.info(`research agent demo \u2014 ${network === "mainnet" ? "real USDC on Stellar mainnet" : "testnet XLM"}; the contract caps the budget`);
  await executeDemo(network === "mainnet" ? await mainnetRuntime(options) : await testnetRuntime());
}

// packages/cli/src/commands/reconcile.ts
import { Networks as Networks3, rpc as rpc6 } from "@stellar/stellar-sdk";
var short5 = (value) => `${value.slice(0, 8)}\u2026${value.slice(-6)}`;
var explorer = (network, hash3) => `https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/tx/${hash3}`;
async function runSettlementReconcile() {
  const loaded = await loadPendingSettlement();
  if (loaded.kind === "none") {
    log.info("no prepared payment is pending");
    return;
  }
  if (loaded.kind === "empty") {
    await clearPendingSettlement();
    log.ok("cleared an interrupted pre-broadcast claim; no transaction hash was ever made durable");
    return;
  }
  if (loaded.kind === "completed") {
    const hash3 = loaded.record.pending.txHash;
    log.chain("prepared payment succeeded and remains durably locked", { tx: short5(hash3) });
    console.log(c.dim(`  ${explorer(loaded.record.network, hash3)}`));
    log.info(`after you durably accept this result, run \`ackrate settlement acknowledge ${hash3}\``);
    return;
  }
  const { pending, source, contractId, network, rpcUrl } = loaded.record;
  log.step("reconciling exact prepared transaction", {
    tx: short5(pending.txHash),
    source,
    contract: `${contractId.slice(0, 6)}\u2026${contractId.slice(-4)}`
  });
  const server = new rpc6.Server(rpcUrl);
  let response;
  try {
    const identity = await server.getNetwork();
    const expectedPassphrase = network === "mainnet" ? Networks3.PUBLIC : Networks3.TESTNET;
    if (identity.passphrase !== expectedPassphrase) {
      throw new Error("RPC network identity does not match the durable settlement journal");
    }
    response = await server.getTransaction(pending.txHash);
  } catch (error) {
    log.err("RPC reconciliation failed; pending state retained", {
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
    return;
  }
  if (response.status === rpc6.Api.GetTransactionStatus.SUCCESS) {
    await markSettlementCompleted(pending.txHash);
    log.chain("prepared payment succeeded; durable acknowledgment is required", { tx: short5(pending.txHash) });
    console.log(c.dim(`  ${explorer(network, pending.txHash)}`));
    log.info(`after you durably accept this result, run \`ackrate settlement acknowledge ${pending.txHash}\``);
    return;
  }
  if (response.status === rpc6.Api.GetTransactionStatus.FAILED) {
    await clearPendingSettlement(pending.txHash);
    log.warn("prepared payment finalized as failed; journal cleared");
    console.log(c.dim(`  ${explorer(network, pending.txHash)}`));
    return;
  }
  const decision = classifyMissingSettlement(pending, response);
  if (decision === "expired") {
    await clearPendingSettlement(pending.txHash);
    log.ok("transaction validity window expired with complete retained RPC history; no payment landed");
    return;
  }
  if (decision === "history-pruned") {
    log.err("RPC history no longer covers the full transaction window; journal retained for manual evidence review");
  } else {
    log.warn("transaction is still within its validity/history window; journal retained");
  }
  process.exitCode = 1;
}
async function runSettlementAcknowledge(txHash) {
  try {
    await acknowledgeCompletedSettlement(txHash);
  } catch (error) {
    log.err("completed payment was not acknowledged", {
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
    return;
  }
  log.ok("completed payment acknowledged; a new payment may now be prepared", {
    tx: short5(txHash)
  });
}

// packages/cli/src/version.ts
var CLI_VERSION = "0.1.9";

// packages/cli/src/commands/ops.ts
import { readFile as readFile2, writeFile } from "node:fs/promises";

// packages/cli/src/ops-signing-request.ts
import { createHash } from "node:crypto";
import {
  Address as Address3,
  FeeBumpTransaction,
  Keypair as Keypair5,
  Networks as Networks4,
  Transaction,
  TransactionBuilder as TransactionBuilder2
} from "@stellar/stellar-sdk";
var REQUEST_KEYS = [
  "version",
  "requestId",
  "network",
  "networkPassphrase",
  "authorityAccount",
  "requiredSignatures",
  "signers",
  "transaction"
];
var TRANSACTION_KEYS = [
  "unsignedEnvelopeXdr",
  "hash",
  "source",
  "sequence",
  "fee",
  "timeBounds",
  "ledgerBounds",
  "effect"
];
var EFFECT_KEYS = ["target", "function", "argsXdr", "argsSha256"];
var SIGNER_KEYS = ["label", "publicKey"];
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object2 = value;
  return `{${Object.keys(object2).sort().map((key) => `${JSON.stringify(key)}:${stable(object2[key])}`).join(",")}}`;
}
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}
function passphraseFor(network) {
  return network === "mainnet" ? Networks4.PUBLIC : Networks4.TESTNET;
}
function parseTransaction(envelopeXdr, networkPassphrase) {
  const parsed = TransactionBuilder2.fromXDR(envelopeXdr, networkPassphrase);
  if (parsed instanceof FeeBumpTransaction || !(parsed instanceof Transaction)) {
    throw new Error("fee-bump envelopes are not accepted for authority requests");
  }
  if (parsed.operations.length !== 1) {
    throw new Error("authority request must contain exactly one operation");
  }
  return parsed;
}
function extractEffect(transaction) {
  const operation = transaction.operations[0];
  if (operation.type !== "invokeHostFunction") {
    throw new Error("authority request must be one invokeHostFunction operation");
  }
  if (operation.func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new Error("authority request must invoke an existing contract");
  }
  const invocation = operation.func.invokeContract();
  const argsXdr = invocation.args().map((arg) => arg.toXDR("base64"));
  return {
    target: Address3.fromScAddress(invocation.contractAddress()).toString(),
    function: invocation.functionName().toString(),
    argsXdr,
    argsSha256: sha256(stable(argsXdr))
  };
}
function normalizeManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("authority manifest must be an object");
  }
  const manifest = value;
  if (!hasExactKeys(manifest, [
    "version",
    "network",
    "authorityAccount",
    "requiredSignatures",
    "signers"
  ]) || manifest.version !== 1 || !["testnet", "mainnet"].includes(manifest.network) || manifest.requiredSignatures !== 2 || !Array.isArray(manifest.signers) || manifest.signers.length !== 3) {
    throw new Error("authority manifest schema is invalid");
  }
  Keypair5.fromPublicKey(manifest.authorityAccount);
  const labels = /* @__PURE__ */ new Set();
  const publicKeys = /* @__PURE__ */ new Set();
  for (const signer of manifest.signers) {
    if (!signer || typeof signer !== "object" || Array.isArray(signer) || !hasExactKeys(signer, SIGNER_KEYS) || !["A", "B", "C"].includes(signer.label)) {
      throw new Error("authority signer schema is invalid");
    }
    Keypair5.fromPublicKey(signer.publicKey);
    labels.add(signer.label);
    publicKeys.add(signer.publicKey);
  }
  if (labels.size !== 3 || publicKeys.size !== 3) {
    throw new Error("authority signers and labels must be unique");
  }
  if (!publicKeys.has(manifest.authorityAccount)) {
    throw new Error("authority account master key must be one of A/B/C");
  }
  return structuredClone(manifest);
}
function requestPayload(request) {
  const { requestId: _requestId, ...payload } = request;
  return payload;
}
function createSigningRequest(unsignedEnvelopeXdr, manifestValue) {
  const manifest = normalizeManifest(manifestValue);
  const networkPassphrase = passphraseFor(manifest.network);
  const transaction = parseTransaction(unsignedEnvelopeXdr, networkPassphrase);
  if (transaction.signatures.length !== 0) {
    throw new Error("signing request input must contain zero signatures");
  }
  if (transaction.source !== manifest.authorityAccount) {
    throw new Error("transaction source does not match the authority account");
  }
  const normalizedXdr = transaction.toXDR();
  const request = {
    version: 1,
    requestId: "",
    network: manifest.network,
    networkPassphrase,
    authorityAccount: manifest.authorityAccount,
    requiredSignatures: 2,
    signers: manifest.signers,
    transaction: {
      unsignedEnvelopeXdr: normalizedXdr,
      hash: transaction.hash().toString("hex"),
      source: transaction.source,
      sequence: transaction.sequence,
      fee: transaction.fee,
      timeBounds: transaction.timeBounds ?? null,
      ledgerBounds: transaction.ledgerBounds ?? null,
      effect: extractEffect(transaction)
    }
  };
  request.requestId = sha256(stable(requestPayload(request)));
  return request;
}
function verifySigningRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signing request must be an object");
  }
  const request = value;
  if (!hasExactKeys(request, REQUEST_KEYS) || !request.transaction || typeof request.transaction !== "object" || Array.isArray(request.transaction) || !hasExactKeys(request.transaction, TRANSACTION_KEYS) || !request.transaction.effect || typeof request.transaction.effect !== "object" || Array.isArray(request.transaction.effect) || !hasExactKeys(request.transaction.effect, EFFECT_KEYS) || !/^[0-9a-f]{64}$/.test(request.requestId)) {
    throw new Error("signing request schema is invalid");
  }
  const manifest = normalizeManifest({
    version: request.version,
    network: request.network,
    authorityAccount: request.authorityAccount,
    requiredSignatures: request.requiredSignatures,
    signers: request.signers
  });
  if (request.networkPassphrase !== passphraseFor(manifest.network)) {
    throw new Error("network passphrase does not match the named network");
  }
  const rebuilt = createSigningRequest(
    request.transaction.unsignedEnvelopeXdr,
    manifest
  );
  if (stable(rebuilt) !== stable(request)) {
    throw new Error("signing request content or requestId does not match its XDR");
  }
  return structuredClone(request);
}
function identifySigner(request, transactionHash, signature) {
  const bytes = signature.signature();
  const matches = request.signers.filter((signer) => {
    const keypair = Keypair5.fromPublicKey(signer.publicKey);
    return keypair.signatureHint().equals(signature.hint()) && keypair.verify(transactionHash, bytes);
  });
  if (matches.length !== 1) {
    throw new Error("signature is unknown or invalid for this request");
  }
  return matches[0].publicKey;
}
function combineSignedEnvelopes(requestValue, signedEnvelopeXdrs) {
  const request = verifySigningRequest(requestValue);
  if (signedEnvelopeXdrs.length !== request.requiredSignatures) {
    throw new Error("exactly two independently signed envelopes are required");
  }
  const hash3 = Buffer.from(request.transaction.hash, "hex");
  const signatures = [];
  const signerPublicKeys = [];
  for (const envelopeXdr of signedEnvelopeXdrs) {
    const transaction = parseTransaction(envelopeXdr, request.networkPassphrase);
    if (transaction.hash().toString("hex") !== request.transaction.hash) {
      throw new Error("signed envelope belongs to a different request");
    }
    if (transaction.signatures.length !== 1) {
      throw new Error("each signer must return exactly one signature");
    }
    const signature = transaction.signatures[0];
    const publicKey = identifySigner(request, hash3, signature);
    if (signerPublicKeys.includes(publicKey)) {
      throw new Error("duplicate signer cannot satisfy the threshold");
    }
    signerPublicKeys.push(publicKey);
    signatures.push(signature);
  }
  const ready = parseTransaction(
    request.transaction.unsignedEnvelopeXdr,
    request.networkPassphrase
  );
  signatures.forEach((signature) => ready.addDecoratedSignature(signature));
  return {
    requestId: request.requestId,
    transactionHash: request.transaction.hash,
    signerPublicKeys,
    signedEnvelopeXdr: ready.toXDR()
  };
}

// packages/cli/src/commands/ops.ts
async function readJson(path) {
  return JSON.parse(await readFile2(path, "utf8"));
}
async function runOpsCreate(xdrPath, manifestPath, outPath) {
  const xdr = (await readFile2(xdrPath, "utf8")).trim();
  const request = createSigningRequest(xdr, await readJson(manifestPath));
  await writeFile(outPath, `${JSON.stringify(request, null, 2)}
`, {
    encoding: "utf8",
    mode: 384,
    flag: "wx"
  });
  console.log(`created immutable request ${request.requestId}`);
  console.log(`transaction ${request.transaction.hash}`);
  console.log(`effect ${request.transaction.effect.target} ${request.transaction.effect.function}`);
}
async function runOpsVerify(requestPath) {
  const request = verifySigningRequest(await readJson(requestPath));
  console.log(`verified request ${request.requestId}`);
  console.log(`transaction ${request.transaction.hash}`);
  console.log(`source ${request.transaction.source}`);
  console.log(`effect ${request.transaction.effect.target} ${request.transaction.effect.function}`);
}
async function runOpsCombine(requestPath, signedPaths, outPath) {
  const request = await readJson(requestPath);
  const signed = await Promise.all(
    signedPaths.map(async (path) => (await readFile2(path, "utf8")).trim())
  );
  const combined = combineSignedEnvelopes(request, signed);
  await writeFile(outPath, `${combined.signedEnvelopeXdr}
`, {
    encoding: "utf8",
    mode: 384,
    flag: "wx"
  });
  console.log(`assembled request ${combined.requestId}`);
  console.log(`transaction ${combined.transactionHash}`);
  console.log(`signers ${combined.signerPublicKeys.join(",")}`);
}

// packages/cli/src/index.ts
var program2 = new Command();
program2.name("ackrate").description("Agent payments on Stellar, enforced on-chain by the Ackrate MandateRegistry.").version(CLI_VERSION);
program2.command("init").description("scaffold a project in the current directory (writes ackrate.config.json)").option("-f, --force", "overwrite an existing ackrate.config.json").action((opts) => runInit(opts));
program2.command("setup").description("generate testnet burner keys and fund them via friendbot").option("-f, --force", "regenerate fresh keys, overwriting existing credentials").action((opts) => runSetup(opts));
var mandate = program2.command("mandate").description("manage AP2 mandates");
mandate.command("create").description("register an AP2 mandate on-chain and approve the SEP-41 allowance").option("-b, --budget <xlm>", "mandate cap in XLM (default: from ackrate.config.json)").option("-e, --expiry <seconds>", "seconds until the mandate expires", "3600").option("-f, --force", "replace an existing stored mandate").action((opts) => runMandateCreate(opts));
program2.command("pay").description("make an agent-signed payment against the active mandate (budget enforced on-chain)").argument("[amount]", "XLM amount to pay (default: unlockPrice from ackrate.config.json)").action((amount) => runPay(amount));
var settlement = program2.command("settlement").description("inspect crash-safe payment state");
settlement.command("reconcile").description("query the exact prepared transaction hash before allowing another payment").action(() => runSettlementReconcile());
settlement.command("acknowledge").description("acknowledge one exact durably recorded successful payment").argument("<tx-hash>", "the exact 64-character lowercase transaction hash").action((txHash) => runSettlementAcknowledge(txHash));
var ops = program2.command("ops").description("coordinate exact 2-of-3 authority requests without handling secrets");
ops.command("create").description("bind one unsigned transaction XDR to an immutable signing request").requiredOption("--xdr <path>", "file containing unsigned transaction-envelope XDR").requiredOption("--manifest <path>", "public 2-of-3 authority manifest").requiredOption("--out <path>", "new request JSON file; refuses to overwrite").action((options) => runOpsCreate(options.xdr, options.manifest, options.out));
ops.command("verify").description("independently verify a request ID, XDR, source, network, and effect").requiredOption("--request <path>", "immutable request JSON file").action((options) => runOpsVerify(options.request));
ops.command("combine").description("verify and combine exactly two independently signed envelopes").requiredOption("--request <path>", "immutable request JSON file").requiredOption("--signed <path...>", "exactly two single-signature XDR files").requiredOption("--out <path>", "new two-signature XDR file; refuses to overwrite").action((options) => runOpsCombine(options.request, options.signed, options.out));
program2.command("demo").description("run the reference research-agent payment flow on testnet or explicitly configured mainnet").argument("[target]", "which demo to run; omit to list available demos").option("--network <network>", "testnet or mainnet", "testnet").option("--manifest <path>", "verified mainnet deployment manifest JSON").option("--user-signer <identity>", "Stellar CLI identity for the mandate user").option("--agent-signer <identity>", "Stellar CLI identity for the payment agent").option("--merchant <address>", "mainnet merchant G-account").option("--budget <usdc>", "explicit real-USDC mandate budget").option("--price <usdc>", "explicit real-USDC price per source").option("--confirm-real-usdc", "acknowledge that mainnet payments are irreversible and spend real USDC").action((target, options) => runDemo(target, options));
program2.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
